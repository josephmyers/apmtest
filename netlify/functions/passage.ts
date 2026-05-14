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

  const passageId = Number(url.searchParams.get("passageId"));
  if (!passageId) throw new HttpError(400, "passageId is required");
  await assertPassageAccess(sql, user.userId, passageId);

  // GET /passage?passageId=123
  if (req.method === "GET") {
    if (url.searchParams.get("unversionedAudio") === "1") {
      const rows = await sql`SELECT unversioned_rendering FROM passages WHERE id = ${passageId}`;
      if (!rows[0]?.unversioned_rendering) return new Response(null, { status: 200 });
      const store = getStore("audio");
      const blob = await store.get(rows[0].unversioned_rendering as string, {
        type: "arrayBuffer",
      });
      if (!blob) return new Response(null, { status: 404 });
      return new Response(blob, {
        status: 200,
        headers: { "Content-Type": "audio/wav", "Cache-Control": "private, no-cache" },
      });
    }

    const rows = await sql`
      SELECT id, section_id, reference, description, sort_order, audio_key, unversioned_rendering, speaker, created_at
      FROM passages WHERE id = ${passageId}
    `;
    if (rows.length === 0) throw new HttpError(404, "Passage not found");

    const p = rows[0];
    return jsonRes({
      passage: {
        id: p.id,
        sectionId: p.section_id,
        reference: p.reference,
        description: p.description,
        sortOrder: p.sort_order,
        audioKey: p.audio_key ?? null,
        unversionedRendering: p.unversioned_rendering ?? null,
        speaker: p.speaker ?? null,
        createdAt: p.created_at,
      },
    });
  }

  // PUT /passage?passageId=123 — store staged rendering blob
  if (req.method === "PUT") {
    const body = await req.arrayBuffer();
    if (!body || body.byteLength === 0) {
      throw new HttpError(400, "No audio data provided");
    }
    const store = getStore("audio");
    const stagedKey = `passage-${passageId}-staged.wav`;
    await store.set(stagedKey, body as ArrayBuffer, {
      metadata: { passageId: String(passageId), uploadedBy: String(user.userId) },
    });
    await sql`UPDATE passages SET unversioned_rendering = ${stagedKey} WHERE id = ${passageId}`;
    return jsonRes({ success: true });
  }

  // DELETE /passage?passageId=123&discardUnversioned=1 — remove staged rendering
  if (req.method === "DELETE") {
    if (url.searchParams.get("discardUnversioned") !== "1") {
      throw new HttpError(400, "discardUnversioned=1 is required");
    }
    const rows = await sql`SELECT unversioned_rendering FROM passages WHERE id = ${passageId}`;
    if (rows.length === 0) throw new HttpError(404, "Passage not found");

    const key = rows[0].unversioned_rendering;
    if (key) {
      const store = getStore("audio");
      await store.delete(key as string);
    }
    await sql`UPDATE passages SET unversioned_rendering = NULL WHERE id = ${passageId}`;
    return jsonRes({ success: true });
  }

  throw new HttpError(405, "Method not allowed");
});
