import { getStore } from "@netlify/blobs";
import { getDb } from "./db.js";
import {
  handle,
  jsonRes,
  getUser,
  assertPassageAccess,
  HttpError,
} from "./_auth.js";

export default handle(async (req: Request) => {
  const user = getUser(req);
  const sql = getDb();
  const url = new URL(req.url);
  const method = req.method;
  const store = getStore("audio");

  // POST /questions?passageId=N&title=...&name=...&selectionStart=...&selectionEnd=...
  // Body: audio blob
  if (method === "POST") {
    const passageId = Number(url.searchParams.get("passageId"));
    if (!passageId) throw new HttpError(400, "passageId is required");
    await assertPassageAccess(sql, user.userId, passageId);

    const title = url.searchParams.get("title") || "";
    const name = url.searchParams.get("name") || "";
    const selectionStart = Number(url.searchParams.get("selectionStart"));
    const selectionEnd = Number(url.searchParams.get("selectionEnd"));
    if (!title) throw new HttpError(400, "title is required");

    const rows = await sql`
      INSERT INTO questions (passage_id, title, name, selection_start, selection_end)
      VALUES (${passageId}, ${title}, ${name}, ${selectionStart}, ${selectionEnd})
      RETURNING id
    `;
    const id = rows[0].id as number;

    const body = await req.arrayBuffer();
    if (body && body.byteLength > 0) {
      const blobKey = `question-${id}.mp3`;
      await store.set(blobKey, body as ArrayBuffer, {
        metadata: { questionId: String(id), uploadedBy: String(user.userId) },
      });
      await sql`UPDATE questions SET audio_key = ${blobKey} WHERE id = ${id}`;
    }

    return jsonRes({
      question: { id, title, name, selectionStart, selectionEnd },
    });
  }

  // GET /questions?id=N&audio=1 — stream question audio blob
  if (method === "GET" && url.searchParams.has("id") && url.searchParams.get("audio")) {
    const id = Number(url.searchParams.get("id"));
    if (!id) throw new HttpError(400, "id is required");

    const rows = await sql`SELECT passage_id, audio_key FROM questions WHERE id = ${id}`;
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

  // GET /questions?passageId=N — list ordered by selection_start
  if (method === "GET") {
    const passageId = Number(url.searchParams.get("passageId"));
    if (!passageId) throw new HttpError(400, "passageId is required");
    await assertPassageAccess(sql, user.userId, passageId);

    const rows = await sql`
      SELECT id, title, name, selection_start, selection_end
      FROM questions
      WHERE passage_id = ${passageId}
      ORDER BY selection_start, created_at
    `;
    return jsonRes({
      questions: rows.map((r: Record<string, unknown>) => ({
        id: r.id,
        title: r.title,
        name: r.name,
        selectionStart: r.selection_start,
        selectionEnd: r.selection_end,
      })),
    });
  }

  // PUT /questions?id=N&title=...&name=...&selectionStart=...&selectionEnd=...
  // Body: optional replacement audio blob
  if (method === "PUT") {
    const id = Number(url.searchParams.get("id"));
    if (!id) throw new HttpError(400, "id is required");

    const existing = await sql`SELECT passage_id FROM questions WHERE id = ${id}`;
    if (existing.length === 0) throw new HttpError(404, "Question not found");
    await assertPassageAccess(sql, user.userId, existing[0].passage_id as number);

    const title = url.searchParams.get("title") || "";
    const name = url.searchParams.get("name") || "";
    const selectionStart = Number(url.searchParams.get("selectionStart"));
    const selectionEnd = Number(url.searchParams.get("selectionEnd"));

    // Store the new recording first (if any) so audio_key can be set in the
    // same UPDATE. COALESCE leaves the existing key when no audio is sent.
    const body = await req.arrayBuffer();
    let audioKey: string | null = null;
    if (body && body.byteLength > 0) {
      audioKey = `question-${id}.mp3`;
      await store.set(audioKey, body as ArrayBuffer, {
        metadata: { questionId: String(id), uploadedBy: String(user.userId) },
      });
    }

    await sql`
      UPDATE questions
      SET title = ${title}, name = ${name},
          selection_start = ${selectionStart}, selection_end = ${selectionEnd},
          audio_key = COALESCE(${audioKey}::text, audio_key)
      WHERE id = ${id}
    `;

    return jsonRes({
      question: { id, title, name, selectionStart, selectionEnd },
    });
  }

  // DELETE /questions?id=N
  if (method === "DELETE") {
    const id = Number(url.searchParams.get("id"));
    if (!id) throw new HttpError(400, "id is required");

    const rows = await sql`SELECT passage_id, audio_key FROM questions WHERE id = ${id}`;
    if (rows.length === 0) return jsonRes({ success: true });
    await assertPassageAccess(sql, user.userId, rows[0].passage_id as number);

    if (rows[0].audio_key) await store.delete(rows[0].audio_key as string);
    await sql`DELETE FROM questions WHERE id = ${id}`;
    return jsonRes({ success: true });
  }

  throw new HttpError(405, "Method not allowed");
});
