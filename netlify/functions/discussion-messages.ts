import { getStore } from "@netlify/blobs";
import { getDb } from "./db.js";
import {
  handle,
  jsonRes,
  getUser,
  assertPassageAccess,
  HttpError,
} from "./_auth.js";
import { parseLinks, readMessageContent, createMessage, storeMessageBlob } from "./_discussions.js";

type Sql = ReturnType<typeof getDb>;
type Row = Record<string, unknown>;

function mapMessage(r: Row) {
  return {
    id: r.id as number,
    discussionId: r.discussion_id as number,
    authorId: r.author_id as number,
    authorEmail: r.author_email as string,
    body: (r.body as string | null) ?? null,
    hasAudio: r.audio_key != null,
    links: (r.links as unknown[]) ?? [],
    createdAt: r.created_at as string,
  };
}

// Re-fetch a single message with its author email, for mutation responses.
async function fetchMessageById(sql: Sql, id: number) {
  const rows = await sql`
    SELECT m.id, m.discussion_id, m.author_id, m.body, m.audio_key, m.links, m.created_at,
           u.email AS author_email
    FROM discussion_messages m JOIN users u ON m.author_id = u.id WHERE m.id = ${id}
  `;
  return mapMessage(rows[0]);
}

export default handle(async (req: Request) => {
  const user = getUser(req);
  const sql = getDb();
  const url = new URL(req.url);
  const method = req.method;
  const store = getStore("audio");

  // GET /discussion-messages?id=N&audio=1 — stream one message's audio.
  if (method === "GET" && url.searchParams.has("id") && url.searchParams.get("audio")) {
    const id = Number(url.searchParams.get("id"));
    if (!id) throw new HttpError(400, "id is required");

    const rows = await sql`
      SELECT m.audio_key, d.passage_id
      FROM discussion_messages m JOIN discussions d ON m.discussion_id = d.id
      WHERE m.id = ${id}
    `;
    if (rows.length === 0) return new Response(null, { status: 404 });
    await assertPassageAccess(sql, user.userId, rows[0].passage_id as number);

    if (!rows[0].audio_key) return new Response(null, { status: 404 });
    const blob = await store.get(rows[0].audio_key as string, { type: "arrayBuffer" });
    if (!blob) return new Response(null, { status: 404 });
    return new Response(blob, {
      status: 200,
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, no-cache" },
    });
  }

  // GET /discussion-messages?discussionId=N — list messages in order.
  if (method === "GET") {
    const discussionId = Number(url.searchParams.get("discussionId"));
    if (!discussionId) throw new HttpError(400, "discussionId is required");

    const rows = await sql`
      SELECT m.id, m.discussion_id, m.author_id, m.body, m.audio_key, m.links, m.created_at,
             u.email AS author_email, d.passage_id
      FROM discussion_messages m
      JOIN users u ON m.author_id = u.id
      JOIN discussions d ON m.discussion_id = d.id
      WHERE m.discussion_id = ${discussionId}
      ORDER BY m.created_at, m.id
    `;

    if (rows.length === 0) throw new HttpError(404, "Discussion not found");
    await assertPassageAccess(sql, user.userId, rows[0].passage_id as number);
    return jsonRes({ messages: rows.map(mapMessage) });
  }

  // POST /discussion-messages?discussionId=N&links= — append a reply.
  if (method === "POST") {
    const discussionId = Number(url.searchParams.get("discussionId"));
    if (!discussionId) throw new HttpError(400, "discussionId is required");
    const drows = await sql`SELECT passage_id FROM discussions WHERE id = ${discussionId}`;
    if (drows.length === 0) throw new HttpError(404, "Discussion not found");
    await assertPassageAccess(sql, user.userId, drows[0].passage_id as number);

    const links = parseLinks(url.searchParams.get("links"));
    const isAudio = url.searchParams.get("audio") === "1";
    const { body, audioBuf } = await readMessageContent(req, isAudio);

    const id = await createMessage(sql, store, {
      discussionId,
      authorId: user.userId,
      body,
      audioBuf,
      links,
    });

    // New activity resets read state to just the author.
    await sql`UPDATE discussions SET read_by = ARRAY[${user.userId}]::int[] WHERE id = ${discussionId}`;

    return jsonRes({ message: await fetchMessageById(sql, id) });
  }

  // PUT /discussion-messages?id=N&links= — edit a message. Author-only.
  if (method === "PUT") {
    const id = Number(url.searchParams.get("id"));
    if (!id) throw new HttpError(400, "id is required");

    const existing = await sql`
      SELECT m.author_id, m.audio_key, d.passage_id
      FROM discussion_messages m JOIN discussions d ON m.discussion_id = d.id
      WHERE m.id = ${id}
    `;
    if (existing.length === 0) throw new HttpError(404, "Message not found");
    await assertPassageAccess(sql, user.userId, existing[0].passage_id as number);
    if ((existing[0].author_id as number) !== user.userId) {
      throw new HttpError(403, "Only the author can edit this message");
    }

    const links = parseLinks(url.searchParams.get("links"));
    const isAudio = url.searchParams.get("audio") === "1";
    const { body, audioBuf } = await readMessageContent(req, isAudio);

    if (audioBuf) {
      const audioKey = await storeMessageBlob(store, id, audioBuf, user.userId);
      await sql`
        UPDATE discussion_messages
        SET body = NULL, audio_key = ${audioKey}, links = ${JSON.stringify(links)}::jsonb
        WHERE id = ${id}
      `;
    } else {
      // Switching to text drops any owned audio blob.
      if (existing[0].audio_key) await store.delete(existing[0].audio_key as string).catch(() => {});
      await sql`
        UPDATE discussion_messages
        SET body = ${body}, audio_key = NULL, links = ${JSON.stringify(links)}::jsonb
        WHERE id = ${id}
      `;
    }

    return jsonRes({ message: await fetchMessageById(sql, id) });
  }

  // DELETE /discussion-messages?id=N — delete a message + its blob. Author-only.
  if (method === "DELETE") {
    const id = Number(url.searchParams.get("id"));
    if (!id) throw new HttpError(400, "id is required");

    const rows = await sql`
      SELECT m.author_id, m.audio_key, d.passage_id
      FROM discussion_messages m JOIN discussions d ON m.discussion_id = d.id
      WHERE m.id = ${id}
    `;
    if (rows.length === 0) return jsonRes({ success: true });
    await assertPassageAccess(sql, user.userId, rows[0].passage_id as number);
    if ((rows[0].author_id as number) !== user.userId) {
      throw new HttpError(403, "Only the author can delete this message");
    }
    if (rows[0].audio_key) await store.delete(rows[0].audio_key as string).catch(() => {});
    await sql`DELETE FROM discussion_messages WHERE id = ${id}`;
    return jsonRes({ success: true });
  }

  throw new HttpError(405, "Method not allowed");
});
