import { getDb } from "./db.js";
import {
  handle,
  jsonRes,
  getUser,
  assertTeamMember,
  assertProjectAccess,
  assertSectionAccess,
  assertPassageAccess,
  deleteAudioBlobsForProjects,
  deleteAudioBlobsForSections,
  deleteAudioBlobsForPassages,
  HttpError,
} from "./_auth.js";

export default handle(async (req: Request) => {
  const user = getUser(req);
  const sql = getDb();
  const url = new URL(req.url);
  const method = req.method;

  // GET /projects?teamId=N — list projects for a team
  if (method === "GET" && !url.searchParams.get("id")) {
    const teamId = Number(url.searchParams.get("teamId"));
    if (!teamId) throw new HttpError(400, "teamId is required");
    await assertTeamMember(sql, user.userId, teamId);

    const projects = await sql`
      SELECT p.id, p.name, p.team_id, p.flags, COUNT(s.id)::int AS section_count
      FROM projects p
      LEFT JOIN sections s ON s.project_id = p.id
      WHERE p.team_id = ${teamId}
      GROUP BY p.id
      ORDER BY p.id
    `;
    return jsonRes({
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        teamId: p.team_id,
        flags: p.flags,
        sectionCount: p.section_count,
      })),
    });
  }

  // GET /projects?id=N — single project with sections and passages
  if (method === "GET") {
    const projectId = Number(url.searchParams.get("id"));
    await assertProjectAccess(sql, user.userId, projectId);

    const [project] = await sql`SELECT * FROM projects WHERE id = ${projectId}`;
    if (!project) throw new HttpError(404, "Project not found");

    const sectionRows = await sql`
      SELECT * FROM sections WHERE project_id = ${projectId} ORDER BY sort_order, id
    `;
    const sectionIds = sectionRows.map((s) => s.id as number);
    let passageRows: Record<string, unknown>[] = [];
    if (sectionIds.length > 0) {
      passageRows = await sql`
        SELECT * FROM passages WHERE section_id = ANY(${sectionIds}) ORDER BY sort_order, id
      `;
    }
    const passagesBySection = new Map<number, Record<string, unknown>[]>();
    for (const p of passageRows) {
      const sectionId = p.section_id as number;
      const list = passagesBySection.get(sectionId) || [];
      list.push(p);
      passagesBySection.set(sectionId, list);
    }
    const sections = sectionRows.map((s) => ({
      ...s,
      passages: passagesBySection.get(s.id as number) || [],
    }));
    return jsonRes({ project: { ...project, sections } });
  }

  // POST /projects — create a project, section, or passage based on body shape.
  // { teamId, name }              → create project
  // { projectId, name }           → create section
  // { sectionId, reference, ... } → create passage
  if (method === "POST") {
    const body = await req.json();

    if (body.teamId != null) {
      const { teamId, name } = body as { teamId: number; name: string };
      if (!teamId || !name) throw new HttpError(400, "teamId and name are required");
      await assertTeamMember(sql, user.userId, teamId);
      const [project] = await sql`
        INSERT INTO projects (team_id, name)
        VALUES (${teamId}, ${name})
        RETURNING id, name, team_id, flags
      `;
      return jsonRes(
        {
          project: {
            id: project.id,
            name: project.name,
            teamId: project.team_id,
            flags: project.flags,
            sectionCount: 0,
          },
        },
        201,
      );
    }

    if (body.sectionId != null) {
      const { sectionId, reference, sortOrder } = body as {
        sectionId: number;
        reference: string;
        sortOrder: number;
      };
      if (!sectionId || !reference) {
        throw new HttpError(400, "sectionId and reference are required");
      }
      await assertSectionAccess(sql, user.userId, sectionId);

      await sql`
        UPDATE passages SET sort_order = sort_order + 1
        WHERE section_id = ${sectionId} AND sort_order >= ${sortOrder}
      `;
      const result = await sql`
        INSERT INTO passages (section_id, reference, sort_order)
        VALUES (${sectionId}, ${reference}, ${sortOrder})
        RETURNING *
      `;
      return jsonRes({ passage: result[0] }, 201);
    }

    if (body.projectId != null) {
      const { projectId, name } = body as { projectId: number; name: string };
      if (!projectId || !name) {
        throw new HttpError(400, "projectId and name are required");
      }
      await assertProjectAccess(sql, user.userId, projectId);
      const maxRow = await sql`
        SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM sections WHERE project_id = ${projectId}
      `;
      const nextOrder = (maxRow[0].max_order as number) + 1;
      const result = await sql`
        INSERT INTO sections (project_id, name, sort_order)
        VALUES (${projectId}, ${name}, ${nextOrder})
        RETURNING *
      `;
      return jsonRes({ section: { ...result[0], passages: [] } }, 201);
    }

    throw new HttpError(400, "teamId, projectId, or sectionId is required");
  }

  // DELETE /projects?projectId=N — delete a project (cascade)
  // DELETE /projects?sectionId=N — delete a section (cascade)
  // DELETE /projects?passageId=N — delete a passage (cascade)
  if (method === "DELETE") {
    const projectId = Number(url.searchParams.get("projectId"));
    const sectionId = Number(url.searchParams.get("sectionId"));
    const passageId = Number(url.searchParams.get("passageId"));

    if (projectId) {
      await assertProjectAccess(sql, user.userId, projectId);
      await deleteAudioBlobsForProjects(sql, [projectId]);
      await sql`DELETE FROM projects WHERE id = ${projectId}`;
      return jsonRes({ success: true });
    }

    if (sectionId) {
      await assertSectionAccess(sql, user.userId, sectionId);
      await deleteAudioBlobsForSections(sql, [sectionId]);
      await sql`DELETE FROM sections WHERE id = ${sectionId}`;
      return jsonRes({ success: true });
    }

    if (passageId) {
      await assertPassageAccess(sql, user.userId, passageId);
      await deleteAudioBlobsForPassages(sql, [passageId]);
      await sql`DELETE FROM passages WHERE id = ${passageId}`;
      return jsonRes({ success: true });
    }

    throw new HttpError(400, "projectId, sectionId, or passageId is required");
  }

  // PATCH /projects — rename a section or passage
  if (method === "PATCH") {
    const body = await req.json();

    if (body.sectionId != null) {
      const { sectionId, name } = body as { sectionId: number; name: string };
      if (!sectionId || typeof name !== "string" || !name.trim()) {
        throw new HttpError(400, "sectionId and name are required");
      }
      await assertSectionAccess(sql, user.userId, sectionId);
      const result = await sql`
        UPDATE sections SET name = ${name.trim()} WHERE id = ${sectionId}
        RETURNING *
      `;
      if (result.length === 0) throw new HttpError(404, "Section not found");
      return jsonRes({ section: result[0] });
    }

    if (body.passageId != null) {
      const { passageId, reference } = body as { passageId: number; reference: string };
      if (!passageId || typeof reference !== "string" || !reference.trim()) {
        throw new HttpError(400, "passageId and reference are required");
      }
      await assertPassageAccess(sql, user.userId, passageId);
      const result = await sql`
        UPDATE passages SET reference = ${reference.trim()} WHERE id = ${passageId}
        RETURNING *
      `;
      if (result.length === 0) throw new HttpError(404, "Passage not found");
      return jsonRes({ passage: result[0] });
    }

    if (body.projectId != null) {
      const projectId = Number(body.projectId);
      if (!projectId) throw new HttpError(400, "projectId is required");
      await assertProjectAccess(sql, user.userId, projectId);

      if (body.flags !== undefined) {
        if (typeof body.flags !== "object" || body.flags === null || Array.isArray(body.flags)) {
          throw new HttpError(400, "flags must be an object");
        }
        const flagsJson = JSON.stringify(body.flags);
        const result = await sql`
          UPDATE projects SET flags = ${flagsJson}::jsonb WHERE id = ${projectId}
          RETURNING id, name, team_id, flags
        `;
        return jsonRes({
          project: {
            id: result[0].id,
            name: result[0].name,
            teamId: result[0].team_id,
            flags: result[0].flags,
          },
        });
      }

      const name = body.name;
      if (typeof name !== "string" || !name.trim()) {
        throw new HttpError(400, "name or flags is required");
      }
      const result = await sql`
        UPDATE projects SET name = ${name.trim()} WHERE id = ${projectId}
        RETURNING id, name, team_id, flags
      `;
      return jsonRes({
        project: {
          id: result[0].id,
          name: result[0].name,
          teamId: result[0].team_id,
          flags: result[0].flags,
        },
      });
    }

    throw new HttpError(400, "sectionId, passageId, or projectId is required");
  }

  throw new HttpError(404, "Not found");
});
