import { getStore } from "@netlify/blobs";
import { getDb } from "./db.js";
import {
  handle,
  jsonRes,
  getUser,
  assertPassageAccess,
  assertReplacementAccess,
  HttpError,
} from "./_auth.js";

export default handle(async (req: Request) => {
  const user = getUser(req);
  const sql = getDb();
  const url = new URL(req.url);
  const method = req.method;
  const store = getStore("audio");

  // POST /replacements?passageId=1&title=...&note=...&selectionStart=0.5&selectionEnd=1.2
  // Body: audio blob
  if (method === "POST") {
    const passageId = Number(url.searchParams.get("passageId"));
    if (!passageId) throw new HttpError(400, "passageId is required");
    await assertPassageAccess(sql, user.userId, passageId);

    const title = url.searchParams.get("title") || "";
    const note = url.searchParams.get("note") || "";
    const name = url.searchParams.get("name") || "";
    const selectionStart = Number(url.searchParams.get("selectionStart"));
    const selectionEnd = Number(url.searchParams.get("selectionEnd"));
    const original = url.searchParams.get("original") !== "false";
    const versionId = url.searchParams.get("versionId")
      ? Number(url.searchParams.get("versionId"))
      : null;
    if (!title) throw new HttpError(400, "title is required");

    const existingEntry =
      versionId !== null
        ? await sql`
            SELECT id, title, note, name, selection_start, selection_end, original, version_id
            FROM replacements
            WHERE passage_id = ${passageId}
              AND version_id = ${versionId}
              AND title = ${title}
              AND note = ${note}
              AND name = ${name}
              AND selection_start = ${selectionStart}
              AND selection_end = ${selectionEnd}
              AND original = ${original}
            LIMIT 1
          `
        : await sql`
            SELECT id, title, note, name, selection_start, selection_end, original, version_id
            FROM replacements
            WHERE passage_id = ${passageId}
              AND version_id IS NULL
              AND title = ${title}
              AND note = ${note}
              AND name = ${name}
              AND selection_start = ${selectionStart}
              AND selection_end = ${selectionEnd}
              AND original = ${original}
            LIMIT 1
          `;
    if (existingEntry.length > 0) {
      const r = existingEntry[0];
      return jsonRes({
        replacement: {
          id: r.id,
          title: r.title,
          note: r.note,
          name: r.name,
          selectionStart: r.selection_start,
          selectionEnd: r.selection_end,
          original: r.original,
          versionId: r.version_id ?? null,
        },
      });
    }

    // Insert row first to get the id
    const rows = await sql`
      INSERT INTO replacements (passage_id, title, note, name, selection_start, selection_end, original, version_id)
      VALUES (${passageId}, ${title}, ${note}, ${name}, ${selectionStart}, ${selectionEnd}, ${original}, ${versionId})
      RETURNING id
    `;
    const id = rows[0].id as number;

    const body = await req.arrayBuffer();
    if (body && body.byteLength > 0) {
      const blobKey = `replacement-${id}.mp3`;
      await store.set(blobKey, body as ArrayBuffer, {
        metadata: { replacementId: String(id), uploadedBy: String(user.userId) },
      });
      await sql`UPDATE replacements SET audio_key = ${blobKey} WHERE id = ${id}`;
    }

    return jsonRes({
      replacement: { id, title, note, name, selectionStart, selectionEnd, original },
    });
  }

  // GET /replacements?id=1&audio=1 — stream replacement audio blob
  if (method === "GET" && url.searchParams.has("id") && url.searchParams.get("audio")) {
    const id = Number(url.searchParams.get("id"));
    if (!id) throw new HttpError(400, "id is required");
    await assertReplacementAccess(sql, user.userId, id);

    const rows = await sql`SELECT audio_key FROM replacements WHERE id = ${id}`;
    if (rows.length === 0 || !rows[0].audio_key) {
      return new Response(null, { status: 404 });
    }
    const blob = await store.get(rows[0].audio_key as string, { type: "arrayBuffer" });
    if (!blob) return new Response(null, { status: 404 });
    return new Response(blob, {
      status: 200,
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, no-cache" },
    });
  }

  // GET /replacements?passageId=1[&versionId=5|null]
  // versionId=null filters to unversioned (NULL) replacements only
  // No versionId param returns all replacements for the passage
  if (method === "GET") {
    const passageId = Number(url.searchParams.get("passageId"));
    if (!passageId) throw new HttpError(400, "passageId is required");
    await assertPassageAccess(sql, user.userId, passageId);

    const versionIdParam = url.searchParams.get("versionId");
    let rows;
    if (versionIdParam === "null") {
      rows = await sql`
        SELECT id, title, note, name, selection_start, selection_end, original, version_id
        FROM replacements
        WHERE passage_id = ${passageId} AND version_id IS NULL
        ORDER BY created_at
      `;
    } else if (versionIdParam !== null) {
      rows = await sql`
        SELECT id, title, note, name, selection_start, selection_end, original, version_id
        FROM replacements
        WHERE passage_id = ${passageId} AND version_id = ${Number(versionIdParam)}
        ORDER BY created_at
      `;
    } else {
      rows = await sql`
        SELECT id, title, note, name, selection_start, selection_end, original, version_id
        FROM replacements
        WHERE passage_id = ${passageId}
        ORDER BY created_at
      `;
    }
    return jsonRes({
      replacements: rows.map((r: Record<string, unknown>) => ({
        id: r.id,
        title: r.title,
        note: r.note,
        name: r.name,
        selectionStart: r.selection_start,
        selectionEnd: r.selection_end,
        original: r.original,
        versionId: r.version_id ?? null,
      })),
    });
  }

  // PUT /replacements?id=1&title=...&note=...&selectionStart=0.5&selectionEnd=1.2
  // Body: audio blob (optional — omit or send empty body to keep existing audio)
  if (method === "PUT") {
    const id = Number(url.searchParams.get("id"));
    if (!id) throw new HttpError(400, "id is required");
    await assertReplacementAccess(sql, user.userId, id);

    const title = url.searchParams.get("title") || "";
    const note = url.searchParams.get("note") || "";
    const name = url.searchParams.get("name") || "";
    const selectionStart = Number(url.searchParams.get("selectionStart"));
    const selectionEnd = Number(url.searchParams.get("selectionEnd"));
    const originalParam = url.searchParams.get("original");
    const original = originalParam !== null ? originalParam !== "false" : "true";
    if (!title) throw new HttpError(400, "title is required");

    await sql`
      UPDATE replacements
      SET title = ${title}, note = ${note}, name = ${name},
          selection_start = ${selectionStart}, selection_end = ${selectionEnd},
          original = ${original}
      WHERE id = ${id}
    `;

    const body = await req.arrayBuffer();
    if (body && body.byteLength > 0) {
      const blobKey = `replacement-${id}.mp3`;
      await store.set(blobKey, body as ArrayBuffer, {
        metadata: { replacementId: String(id), uploadedBy: String(user.userId) },
      });
      await sql`UPDATE replacements SET audio_key = ${blobKey} WHERE id = ${id}`;
    }

    return jsonRes({
      replacement: { id, title, note, name, selectionStart, selectionEnd, original },
    });
  }

  // DELETE /replacements?id=1 — delete a single replacement
  // DELETE /replacements?passageId=1 — delete all unversioned replacements for a passage
  if (method === "DELETE") {
    const id = Number(url.searchParams.get("id"));
    const passageId = Number(url.searchParams.get("passageId"));

    if (id) {
      await assertReplacementAccess(sql, user.userId, id);
      const rows = await sql`SELECT audio_key, original, title, note FROM replacements WHERE id = ${id}`;
      if (rows.length > 0) {
        if (rows[0].audio_key) {
          await store.delete(rows[0].audio_key as string);
        }
        if (rows[0].original) {
          // If deleting the original, check for copies and make a copy the new original
          const copies = await sql`SELECT id FROM replacements WHERE title = ${rows[0].title} AND note = ${rows[0].note} AND id != ${id} LIMIT 1`;
          if (copies.length > 0) {
            await sql`UPDATE replacements SET original = true WHERE id = ${copies[0].id}`;
          }
        }
      }
      await sql`DELETE FROM replacements WHERE id = ${id}`;
      return jsonRes({ success: true });
    }

    if (passageId) {
      await assertPassageAccess(sql, user.userId, passageId);
      const rows = await sql`
        SELECT audio_key FROM replacements
        WHERE passage_id = ${passageId} AND version_id IS NULL
      `;
      for (const r of rows) {
        if (r.audio_key) await store.delete(r.audio_key as string);
      }
      await sql`DELETE FROM replacements WHERE passage_id = ${passageId} AND version_id IS NULL`;
      return jsonRes({ success: true });
    }

    throw new HttpError(400, "id or passageId is required");
  }

  // PATCH /replacements?passageId=1&versionId=5
  // Bulk-associate all unversioned replacements for a passage with a version
  if (method === "PATCH") {
    const passageId = Number(url.searchParams.get("passageId"));
    const versionId = Number(url.searchParams.get("versionId"));
    if (!passageId) throw new HttpError(400, "passageId is required");
    if (!versionId) throw new HttpError(400, "versionId is required");
    await assertPassageAccess(sql, user.userId, passageId);

    await sql`
      UPDATE replacements SET version_id = ${versionId}
      WHERE passage_id = ${passageId} AND version_id IS NULL
    `;
    return jsonRes({ success: true });
  }

  throw new HttpError(405, "Method not allowed");
});
