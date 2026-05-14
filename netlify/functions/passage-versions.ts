import { getStore } from "@netlify/blobs";
import { getDb } from "./db.js";
import {
  handle,
  jsonRes,
  getUser,
  assertPassageAccess,
  assertVersionAccess,
  HttpError,
} from "./_auth.js";

export default handle(async (req: Request) => {
  const user = getUser(req);
  const sql = getDb();
  const url = new URL(req.url);
  const method = req.method;
  const store = getStore("audio");

  // POST /passage-versions?passageId=123&renderSource=...&activate=1
  // Body: audio blob
  // renderSource: if provided, this is an AI-rendered version (links to source audio key)
  if (method === "POST") {
    const passageId = Number(url.searchParams.get("passageId"));
    if (!passageId) throw new HttpError(400, "passageId is required");
    await assertPassageAccess(sql, user.userId, passageId);

    const renderSource = url.searchParams.get("renderSource") || null;
    const activate = url.searchParams.get("activate") !== "0";
    const note = url.searchParams.get("note") || "";
    const isRendered = renderSource !== null;

    const body = await req.arrayBuffer();
    if (!body || body.byteLength === 0) {
      throw new HttpError(400, "No audio data provided");
    }
    if (body.byteLength > 5.5 * 1024 * 1024) {
      throw new HttpError(413, "Audio file too large (max 5.5 MB)");
    }

    // Insert version row to get its ID
    const [version] = await sql`
      INSERT INTO passage_versions (passage_id, audio_key, render_source, note)
      VALUES (${passageId}, '', ${renderSource}, ${note})
      RETURNING id, created_at
    `;

    const ext = isRendered ? "wav" : "mp3";
    const blobKey = `passage-${passageId}-v${version.id}.${ext}`;
    await store.set(blobKey, body as ArrayBuffer, {
      metadata: {
        passageId: String(passageId),
        versionId: String(version.id),
        uploadedBy: String(user.userId),
      },
    });
    await sql`UPDATE passage_versions SET audio_key = ${blobKey} WHERE id = ${version.id}`;

    // Optionally activate this version as the passage's current audio
    if (activate) {
      const speaker = url.searchParams.get("speaker");
      if (speaker) {
        await sql`
          UPDATE passages SET audio_key = ${blobKey}, speaker = ${speaker}, unversioned_rendering = NULL WHERE id = ${passageId}
        `;
      } else {
        await sql`
          UPDATE passages SET audio_key = ${blobKey}, unversioned_rendering = NULL WHERE id = ${passageId}
        `;
      }
    }

    return jsonRes({
      version: {
        id: version.id,
        passageId,
        audioKey: blobKey,
        renderSource,
        note,
        createdAt: version.created_at,
      },
    });
  }

  // PATCH /passage-versions?id=123 — activate a version
  if (method === "PATCH") {
    const versionId = Number(url.searchParams.get("id"));
    if (!versionId) throw new HttpError(400, "id is required");
    await assertVersionAccess(sql, user.userId, versionId);

    const [version] = await sql`
      SELECT id, passage_id, audio_key FROM passage_versions WHERE id = ${versionId}
    `;
    if (!version) throw new HttpError(404, "Version not found");

    await sql`
      UPDATE passages SET audio_key = ${version.audio_key}, unversioned_rendering = NULL WHERE id = ${version.passage_id}
    `;
    return jsonRes({ success: true });
  }

  // GET /passage-versions?id=123&audio=1 — fetch audio blob for a specific version
  // GET /passage-versions?passageId=123&audio=1 — fetch the passage's current active audio
  // GET /passage-versions?passageId=123 — list all versions
  if (method === "GET") {
    const versionId = Number(url.searchParams.get("id"));
    const passageId = Number(url.searchParams.get("passageId"));
    const wantAudio = url.searchParams.get("audio") === "1";

    if (versionId && wantAudio) {
      await assertVersionAccess(sql, user.userId, versionId);
      const [version] = await sql`
        SELECT audio_key FROM passage_versions WHERE id = ${versionId}
      `;
      if (!version) throw new HttpError(404, "Version not found");
      const blob = await store.get(version.audio_key as string, { type: "arrayBuffer" });
      if (!blob) throw new HttpError(404, "Audio not found");
      const contentType = String(version.audio_key).endsWith(".wav") ? "audio/wav" : "audio/mpeg";
      return new Response(blob, {
        status: 200,
        headers: { "Content-Type": contentType, "Cache-Control": "private, no-cache" },
      });
    }

    if (!passageId) throw new HttpError(400, "passageId is required");
    await assertPassageAccess(sql, user.userId, passageId);

    if (wantAudio) {
      const [passage] = await sql`SELECT audio_key FROM passages WHERE id = ${passageId}`;
      if (!passage?.audio_key) throw new HttpError(404, "No audio found for this passage");
      const blob = await store.get(passage.audio_key as string, { type: "arrayBuffer" });
      if (!blob) throw new HttpError(404, "No audio found for this passage");
      const contentType = String(passage.audio_key).endsWith(".wav") ? "audio/wav" : "audio/mpeg";
      return new Response(blob, {
        status: 200,
        headers: { "Content-Type": contentType, "Cache-Control": "private, no-cache" },
      });
    }

    const rows = await sql`
      SELECT id, passage_id, audio_key, render_source, note, created_at
      FROM passage_versions
      WHERE passage_id = ${passageId}
      ORDER BY created_at DESC
    `;
    return jsonRes({
      versions: rows.map((r: Record<string, unknown>) => ({
        id: r.id,
        passageId: r.passage_id,
        audioKey: r.audio_key,
        renderSource: r.render_source,
        note: r.note,
        createdAt: r.created_at,
      })),
    });
  }

  // DELETE /passage-versions?id=123 — delete a specific version
  // DELETE /passage-versions?passageId=123 — remove the passage's current audio
  if (method === "DELETE") {
    const versionId = Number(url.searchParams.get("id"));
    if (versionId) {
      await assertVersionAccess(sql, user.userId, versionId);
      const [version] = await sql`
        SELECT id, passage_id, audio_key FROM passage_versions WHERE id = ${versionId}
      `;
      if (!version) throw new HttpError(404, "Version not found");
      await store.delete(version.audio_key as string);
      await sql`DELETE FROM passage_versions WHERE id = ${versionId}`;
      await sql`
        UPDATE passages SET audio_key = NULL
        WHERE id = ${version.passage_id} AND audio_key = ${version.audio_key}
      `;
      return jsonRes({ success: true });
    }

    const passageId = Number(url.searchParams.get("passageId"));
    if (!passageId) throw new HttpError(400, "passageId is required");
    await assertPassageAccess(sql, user.userId, passageId);

    const [passage] = await sql`SELECT audio_key FROM passages WHERE id = ${passageId}`;
    if (passage?.audio_key) {
      await store.delete(passage.audio_key as string);
    }
    await sql`UPDATE passages SET audio_key = NULL WHERE id = ${passageId}`;
    return jsonRes({ success: true });
  }

  throw new HttpError(405, "Method not allowed");
});
