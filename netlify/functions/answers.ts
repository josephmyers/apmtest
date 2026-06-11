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

  // GET /answers?passageId=N — list every answer for a passage (metadata only).
  // The client pairs these with their questions and fetches audio per answer.
  if (method === "GET" && url.searchParams.has("passageId")) {
    const passageId = Number(url.searchParams.get("passageId"));
    if (!passageId) throw new HttpError(400, "passageId is required");
    await assertPassageAccess(sql, user.userId, passageId);
    const rows = await sql`
      SELECT a.question_id, a.speaker
      FROM answers a
      JOIN questions q ON a.question_id = q.id
      WHERE q.passage_id = ${passageId} AND a.audio_key IS NOT NULL
    `;
    return jsonRes({
      answers: rows.map((r: Record<string, unknown>) => ({
        questionId: r.question_id,
        speaker: r.speaker,
      })),
    });
  }

  const questionId = Number(url.searchParams.get("questionId"));
  if (!questionId) throw new HttpError(400, "questionId is required");

  const qRows = await sql`SELECT passage_id FROM questions WHERE id = ${questionId}`;
  if (qRows.length === 0) throw new HttpError(404, "Question not found");
  await assertPassageAccess(sql, user.userId, qRows[0].passage_id as number);

  const blobKey = `answer-${questionId}.mp3`;

  // GET /answers?questionId=N&audio=1 — stream the answer audio blob
  if (method === "GET" && url.searchParams.get("audio")) {
    const rows = await sql`SELECT audio_key FROM answers WHERE question_id = ${questionId}`;
    if (rows.length === 0 || !rows[0].audio_key) return new Response(null, { status: 404 });
    const blob = await store.get(rows[0].audio_key as string, { type: "arrayBuffer" });
    if (!blob) return new Response(null, { status: 404 });
    return new Response(blob, {
      status: 200,
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, no-cache" },
    });
  }

  // POST /answers?questionId=N&speaker=... — save a new answer or update an existing.
  if (method === "POST") {
    const speaker = url.searchParams.get("speaker") || "";
    const body = await req.arrayBuffer();

    if (body && body.byteLength > 0) {
      await store.set(blobKey, body as ArrayBuffer, {
        metadata: { questionId: String(questionId), uploadedBy: String(user.userId) },
      });
      await sql`
        INSERT INTO answers (question_id, speaker, audio_key)
        VALUES (${questionId}, ${speaker}, ${blobKey})
        ON CONFLICT (question_id) DO UPDATE
          SET speaker = ${speaker}, audio_key = ${blobKey}
      `;
    } else {
      const rows = await sql`
        UPDATE answers SET speaker = ${speaker} WHERE question_id = ${questionId} RETURNING id
      `;
      if (rows.length === 0) throw new HttpError(404, "Answer not found");
    }

    return jsonRes({ answer: { questionId, speaker } });
  }

  // DELETE /answers?questionId=N — clear the answer (remove it from the question)
  if (method === "DELETE") {
    const rows = await sql`SELECT audio_key FROM answers WHERE question_id = ${questionId}`;
    if (rows.length > 0 && rows[0].audio_key) {
      await store.delete(rows[0].audio_key as string);
    }
    await sql`DELETE FROM answers WHERE question_id = ${questionId}`;
    return jsonRes({ success: true });
  }

  throw new HttpError(405, "Method not allowed");
});
