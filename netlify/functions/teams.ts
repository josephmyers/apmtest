import { getDb } from "./db.js";
import {
  handle,
  jsonRes,
  getUser,
  assertTeamMember,
  deleteAudioBlobsForProjects,
  HttpError,
} from "./_auth.js";

export default handle(async (req: Request) => {
  const user = getUser(req);
  const sql = getDb();
  const url = new URL(req.url);
  const method = req.method;

  // GET /teams — list teams the current user belongs to
  if (method === "GET") {
    const teams = await sql`
      SELECT id, name FROM teams
      WHERE id = ANY(
        SELECT UNNEST(team_ids) FROM users WHERE id = ${user.userId}
      )
      ORDER BY id
    `;
    return jsonRes({ teams });
  }

  // POST /teams { name } — create team, add creator as member
  if (method === "POST") {
    const { name } = await req.json();
    if (!name || typeof name !== "string" || !name.trim()) {
      throw new HttpError(400, "name is required");
    }
    const trimmed = name.trim();
    const [team] = await sql`
      INSERT INTO teams (name) VALUES (${trimmed})
      RETURNING id, name
    `;
    await sql`
      UPDATE users SET team_ids = array_append(team_ids, ${team.id})
      WHERE id = ${user.userId}
    `;
    return jsonRes({ team }, 201);
  }

  // PATCH /teams?id=N { name } — rename
  if (method === "PATCH") {
    const teamId = Number(url.searchParams.get("id"));
    if (!teamId) throw new HttpError(400, "id is required");
    await assertTeamMember(sql, user.userId, teamId);

    const { name } = await req.json();
    if (!name || typeof name !== "string" || !name.trim()) {
      throw new HttpError(400, "name is required");
    }
    const [team] = await sql`
      UPDATE teams SET name = ${name.trim()} WHERE id = ${teamId}
      RETURNING id, name
    `;
    return jsonRes({ team });
  }

  // DELETE /teams?id=N — delete (scrub user arrays, blobs, then SQL delete)
  if (method === "DELETE") {
    const teamId = Number(url.searchParams.get("id"));
    if (!teamId) throw new HttpError(400, "id is required");
    await assertTeamMember(sql, user.userId, teamId);

    const projectRows = await sql`SELECT id FROM projects WHERE team_id = ${teamId}`;
    await deleteAudioBlobsForProjects(
      sql,
      projectRows.map((r) => r.id as number),
    );

    // Scrub array references (no FK cascade for INTEGER[]).
    await sql`
      UPDATE users SET team_ids = array_remove(team_ids, ${teamId})
      WHERE ${teamId} = ANY(team_ids)
    `;
    // Cascade drops projects → sections → passages → versions/replacements.
    await sql`DELETE FROM teams WHERE id = ${teamId}`;
    return jsonRes({ success: true });
  }

  throw new HttpError(405, "Method not allowed");
});
