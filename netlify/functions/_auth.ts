import jwt from "jsonwebtoken";
import { getStore } from "@netlify/blobs";
import type { getDb } from "./db.js";

type Sql = ReturnType<typeof getDb>;

const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production";

export interface AuthedUser {
  userId: number;
  email: string;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function jsonRes(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function getUser(req: Request): AuthedUser {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new HttpError(401, "Unauthorized");
  }
  try {
    const token = authHeader.split(" ")[1];
    return jwt.verify(token, JWT_SECRET) as AuthedUser;
  } catch {
    throw new HttpError(401, "Unauthorized");
  }
}

export function handle(
  fn: (req: Request) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    try {
      return await fn(req);
    } catch (err) {
      if (err instanceof HttpError) {
        return jsonRes({ error: err.message }, err.status);
      }
      const message = err instanceof Error ? err.message : "Internal server error";
      console.error("Handler error:", err);
      return jsonRes({ error: message }, 500);
    }
  };
}

export async function assertTeamMember(
  sql: Sql,
  userId: number,
  teamId: number,
): Promise<void> {
  const rows = await sql`
    SELECT 1 FROM users WHERE id = ${userId} AND ${teamId} = ANY(team_ids)
  `;
  if (rows.length === 0) throw new HttpError(403, "Not a member of this team");
}

export async function assertProjectAccess(
  sql: Sql,
  userId: number,
  projectId: number,
): Promise<void> {
  const rows = await sql`
    SELECT 1 FROM projects p
    JOIN users u ON p.team_id = ANY(u.team_ids)
    WHERE p.id = ${projectId} AND u.id = ${userId}
  `;
  if (rows.length === 0) throw new HttpError(403, "No access to this project");
}

export async function assertSectionAccess(
  sql: Sql,
  userId: number,
  sectionId: number,
): Promise<void> {
  const rows = await sql`
    SELECT 1 FROM sections s
    JOIN projects p ON s.project_id = p.id
    JOIN users u ON p.team_id = ANY(u.team_ids)
    WHERE s.id = ${sectionId} AND u.id = ${userId}
  `;
  if (rows.length === 0) throw new HttpError(403, "No access to this section");
}

export async function assertPassageAccess(
  sql: Sql,
  userId: number,
  passageId: number,
): Promise<void> {
  const rows = await sql`
    SELECT 1 FROM passages pa
    JOIN sections s ON pa.section_id = s.id
    JOIN projects p ON s.project_id = p.id
    JOIN users u ON p.team_id = ANY(u.team_ids)
    WHERE pa.id = ${passageId} AND u.id = ${userId}
  `;
  if (rows.length === 0) throw new HttpError(403, "No access to this passage");
}

export async function assertVersionAccess(
  sql: Sql,
  userId: number,
  versionId: number,
): Promise<void> {
  const rows = await sql`
    SELECT 1 FROM passage_versions v
    JOIN passages pa ON v.passage_id = pa.id
    JOIN sections s ON pa.section_id = s.id
    JOIN projects p ON s.project_id = p.id
    JOIN users u ON p.team_id = ANY(u.team_ids)
    WHERE v.id = ${versionId} AND u.id = ${userId}
  `;
  if (rows.length === 0) throw new HttpError(403, "No access to this version");
}

export async function assertReplacementAccess(
  sql: Sql,
  userId: number,
  replacementId: number,
): Promise<void> {
  const rows = await sql`
    SELECT 1 FROM replacements r
    JOIN passages pa ON r.passage_id = pa.id
    JOIN sections s ON pa.section_id = s.id
    JOIN projects p ON s.project_id = p.id
    JOIN users u ON p.team_id = ANY(u.team_ids)
    WHERE r.id = ${replacementId} AND u.id = ${userId}
  `;
  if (rows.length === 0) throw new HttpError(403, "No access to this replacement");
}

// Collect every audio-blob key referenced by the given passages and delete each
// from the "audio" blob store. Used by cascading deletes (project, section,
// passage). Errors on individual deletes are logged but do not abort the batch.
export async function deleteAudioBlobsForPassages(
  sql: Sql,
  passageIds: number[],
): Promise<void> {
  if (passageIds.length === 0) return;
  const store = getStore("audio");

  const passageRows = await sql`
    SELECT audio_key, unversioned_rendering FROM passages
    WHERE id = ANY(${passageIds})
  `;
  const versionRows = await sql`
    SELECT audio_key FROM passage_versions WHERE passage_id = ANY(${passageIds})
  `;
  const replacementRows = await sql`
    SELECT audio_key FROM replacements WHERE passage_id = ANY(${passageIds})
  `;
  const questionRows = await sql`
    SELECT audio_key FROM questions WHERE passage_id = ANY(${passageIds})
  `;
  const answerRows = await sql`
    SELECT a.audio_key FROM answers a
    JOIN questions q ON a.question_id = q.id
    WHERE q.passage_id = ANY(${passageIds})
  `;

  const keys = new Set<string>();
  for (const r of passageRows) {
    if (r.audio_key) keys.add(r.audio_key as string);
    if (r.unversioned_rendering) keys.add(r.unversioned_rendering as string);
  }
  for (const r of versionRows) if (r.audio_key) keys.add(r.audio_key as string);
  for (const r of replacementRows) if (r.audio_key) keys.add(r.audio_key as string);
  for (const r of questionRows) if (r.audio_key) keys.add(r.audio_key as string);
  for (const r of answerRows) if (r.audio_key) keys.add(r.audio_key as string);

  await Promise.all(
    Array.from(keys).map((k) =>
      store.delete(k).catch((err) =>
        console.error(`Failed to delete blob ${k}:`, err),
      ),
    ),
  );
}

export async function deleteAudioBlobsForProjects(
  sql: Sql,
  projectIds: number[],
): Promise<void> {
  if (projectIds.length === 0) return;
  const passageRows = await sql`
    SELECT pa.id FROM passages pa
    JOIN sections s ON pa.section_id = s.id
    WHERE s.project_id = ANY(${projectIds})
  `;
  await deleteAudioBlobsForPassages(
    sql,
    passageRows.map((r) => r.id as number),
  );
}

export async function deleteAudioBlobsForSections(
  sql: Sql,
  sectionIds: number[],
): Promise<void> {
  if (sectionIds.length === 0) return;
  const passageRows = await sql`
    SELECT id FROM passages WHERE section_id = ANY(${sectionIds})
  `;
  await deleteAudioBlobsForPassages(
    sql,
    passageRows.map((r) => r.id as number),
  );
}
