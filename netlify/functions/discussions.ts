import { getStore } from "@netlify/blobs";
import { getDb } from "./db.js";
import {
  handle,
  jsonRes,
  getUser,
  assertPassageAccess,
  HttpError,
} from "./_auth.js";
import { parseLinks, readMessageContent, createMessage } from "./_discussions.js";

type Sql = ReturnType<typeof getDb>;
type Row = Record<string, unknown>;

function mapDiscussion(r: Row) {
  return {
    id: r.id as number,
    topic: r.topic as string,
    category: r.category as string,
    assigneeId: (r.assignee_id as number | null) ?? null,
    assigneeEmail: (r.assignee_email as string | null) ?? null,
    resolved: r.resolved as boolean,
    unread: !(r.is_read as boolean),
    createdBy: r.created_by as number,
    createdAt: r.created_at as string,
    messageCount: Number(r.message_count ?? 0),
    lastActivity: (r.last_activity as string | null) ?? null,
  };
}

// Assembled thread row (metadata + per-caller read flag + activity aggregates).
async function fetchDiscussionById(sql: Sql, userId: number, id: number) {
  const rows = await sql`
    SELECT d.id, d.topic, d.category, d.assignee_id, d.resolved, d.created_by, d.created_at,
           au.email AS assignee_email,
           COUNT(m.id) AS message_count,
           MAX(m.created_at) AS last_activity,
           ${userId} = ANY(d.read_by) AS is_read
    FROM discussions d
    LEFT JOIN discussion_messages m ON m.discussion_id = d.id
    LEFT JOIN users au ON d.assignee_id = au.id
    WHERE d.id = ${id}
    GROUP BY d.id, au.email
  `;
  return rows.length ? mapDiscussion(rows[0]) : null;
}

// Register a brand-new category on the team that owns the passage.
async function registerCategory(sql: Sql, passageId: number, category: string) {
  if (!category) return;
  await sql`
    UPDATE teams SET categories = array_append(categories, ${category})
    WHERE id = (
      SELECT p.team_id FROM passages pa
      JOIN sections s ON pa.section_id = s.id
      JOIN projects p ON s.project_id = p.id
      WHERE pa.id = ${passageId}
    )
    AND NOT (${category} = ANY(categories))
  `;
}

export default handle(async (req: Request) => {
  const user = getUser(req);
  const sql = getDb();
  const url = new URL(req.url);
  const method = req.method;
  const store = getStore("audio");

  // GET /discussions?passageId=N&step=N — list threads, oldest first (newest last).
  if (method === "GET") {
    const passageId = Number(url.searchParams.get("passageId"));
    const step = Number(url.searchParams.get("step"));
    if (!passageId || !step) throw new HttpError(400, "passageId and step are required");
    await assertPassageAccess(sql, user.userId, passageId);

    const rows = await sql`
      SELECT d.id, d.topic, d.category, d.assignee_id, d.resolved, d.created_by, d.created_at,
             au.email AS assignee_email,
             COUNT(m.id) AS message_count,
             MAX(m.created_at) AS last_activity,
             ${user.userId} = ANY(d.read_by) AS is_read
      FROM discussions d
      LEFT JOIN discussion_messages m ON m.discussion_id = d.id
      LEFT JOIN users au ON d.assignee_id = au.id
      WHERE d.passage_id = ${passageId} AND d.step = ${step}
      GROUP BY d.id, au.email
      ORDER BY d.created_at, d.id
    `;
    return jsonRes({ discussions: rows.map(mapDiscussion) });
  }

  if (method === "POST") {
    // Mark read: POST /discussions?id=N&read=1 — append the caller to read_by.
    if (url.searchParams.has("read")) {
      const id = Number(url.searchParams.get("id"));
      if (!id) throw new HttpError(400, "id is required");
      const rows = await sql`SELECT passage_id FROM discussions WHERE id = ${id}`;
      if (rows.length === 0) throw new HttpError(404, "Discussion not found");
      await assertPassageAccess(sql, user.userId, rows[0].passage_id as number);
      await sql`
        UPDATE discussions SET read_by = array_append(read_by, ${user.userId})
        WHERE id = ${id} AND NOT (${user.userId} = ANY(read_by))
      `;
      return jsonRes({ success: true });
    }

    // Create thread + first message. POST /discussions?passageId=&step=&topic=&category=&assigneeId=&links=
    const passageId = Number(url.searchParams.get("passageId"));
    const step = Number(url.searchParams.get("step"));
    if (!passageId || !step) throw new HttpError(400, "passageId and step are required");
    await assertPassageAccess(sql, user.userId, passageId);

    const topic = (url.searchParams.get("topic") || "").trim();
    if (!topic) throw new HttpError(400, "topic is required");
    const category = (url.searchParams.get("category") || "").trim();
    const assigneeRaw = url.searchParams.get("assigneeId");
    const assigneeId = assigneeRaw ? Number(assigneeRaw) : null;
    const links = parseLinks(url.searchParams.get("links"));
    const isAudio = url.searchParams.get("audio") === "1";
    // Validate the first message's content before creating the thread.
    const { body, audioBuf } = await readMessageContent(req, isAudio);

    // Thread; the creator has implicitly read it.
    const dRows = await sql`
      INSERT INTO discussions (passage_id, step, topic, category, assignee_id, read_by, created_by)
      VALUES (${passageId}, ${step}, ${topic}, ${category}, ${assigneeId},
              ARRAY[${user.userId}]::int[], ${user.userId})
      RETURNING id
    `;
    const discussionId = dRows[0].id as number;

    await createMessage(sql, store, {
      discussionId,
      authorId: user.userId,
      body,
      audioBuf,
      links,
    });

    await registerCategory(sql, passageId, category);

    return jsonRes({ discussion: await fetchDiscussionById(sql, user.userId, discussionId) });
  }

  // PUT /discussions?id=N&topic=&category=&assigneeId=&resolved= — edit metadata.
  if (method === "PUT") {
    const id = Number(url.searchParams.get("id"));
    if (!id) throw new HttpError(400, "id is required");
    const rows = await sql`SELECT passage_id FROM discussions WHERE id = ${id}`;
    if (rows.length === 0) throw new HttpError(404, "Discussion not found");
    const passageId = rows[0].passage_id as number;
    await assertPassageAccess(sql, user.userId, passageId);

    const topic = (url.searchParams.get("topic") || "").trim();
    if (!topic) throw new HttpError(400, "topic is required");
    const category = (url.searchParams.get("category") || "").trim();
    const assigneeRaw = url.searchParams.get("assigneeId");
    const assigneeId = assigneeRaw ? Number(assigneeRaw) : null;
    const resolved = url.searchParams.get("resolved") === "1";

    await sql`
      UPDATE discussions
      SET topic = ${topic}, category = ${category}, assignee_id = ${assigneeId}, resolved = ${resolved}
      WHERE id = ${id}
    `;
    await registerCategory(sql, passageId, category);

    return jsonRes({ discussion: await fetchDiscussionById(sql, user.userId, id) });
  }

  // DELETE /discussions?id=N — delete thread + its owned message blobs.
  if (method === "DELETE") {
    const id = Number(url.searchParams.get("id"));
    if (!id) throw new HttpError(400, "id is required");
    const drows = await sql`SELECT passage_id FROM discussions WHERE id = ${id}`;
    if (drows.length === 0) return jsonRes({ success: true });
    await assertPassageAccess(sql, user.userId, drows[0].passage_id as number);

    const blobRows = await sql`
      SELECT audio_key FROM discussion_messages
      WHERE discussion_id = ${id} AND audio_key IS NOT NULL
    `;
    await Promise.all(
      blobRows.map((r: Row) => store.delete(r.audio_key as string).catch(() => {})),
    );
    await sql`DELETE FROM discussions WHERE id = ${id}`;
    return jsonRes({ success: true });
  }

  throw new HttpError(405, "Method not allowed");
});
