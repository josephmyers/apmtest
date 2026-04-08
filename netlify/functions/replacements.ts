import type { Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import jwt from "jsonwebtoken";
import { getDb } from "./db.js";

const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production";

function unauthorized(msg = "Unauthorized") {
  return new Response(JSON.stringify({ error: msg }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

function jsonRes(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function getUser(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const token = authHeader.split(" ")[1];
    return jwt.verify(token, JWT_SECRET) as { userId: number; email: string };
  } catch {
    return null;
  }
}

export default async function handler(req: Request, _context: Context) {
  const user = getUser(req);
  if (!user) return unauthorized();

  try {
    const sql = getDb();
    const url = new URL(req.url);
    const method = req.method;

    const store = getStore("audio");

    // POST /replacements?passageId=1&title=...&note=...&selectionStart=0.5&selectionEnd=1.2
    // Body: audio blob
    if (method === "POST") {
      const passageId = Number(url.searchParams.get("passageId"));
      const title = url.searchParams.get("title") || "";
      const note = url.searchParams.get("note") || "";
      const name = url.searchParams.get("name") || "";
      const selectionStart = Number(url.searchParams.get("selectionStart"));
      const selectionEnd = Number(url.searchParams.get("selectionEnd"));
      const original = url.searchParams.get("original") !== "false";
      const versionId = url.searchParams.get("versionId")
        ? Number(url.searchParams.get("versionId"))
        : null;

      if (!passageId) return jsonRes({ error: "passageId is required" }, 400);
      if (!title) return jsonRes({ error: "title is required" }, 400);

      // Return existing record if an identical replacement already exists (duplication guard)
      const existingEntry = versionId !== null
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
      const id = rows[0].id;

      // Store audio blob if provided
      const body = await req.arrayBuffer();
      if (body && body.byteLength > 0) {
        const blobKey = `replacement-${id}.mp3`;
        await store.set(blobKey, body as ArrayBuffer, {
          metadata: { replacementId: String(id), uploadedBy: String(user.userId) },
        });
        await sql`
          UPDATE replacements SET audio_key = ${blobKey} WHERE id = ${id}
        `;
      }

      return jsonRes({
        replacement: {
          id,
          title,
          note,
          name,
          selectionStart,
          selectionEnd,
          original,
        },
      });
    }

    // GET /replacements?id=1&audio=1 — stream replacement audio blob
    if (method === "GET" && url.searchParams.has("id") && url.searchParams.get("audio")) {
      const id = Number(url.searchParams.get("id"));
      if (!id) return jsonRes({ error: "id is required" }, 400);

      const rows = await sql`
        SELECT audio_key FROM replacements WHERE id = ${id}
      `;
      if (rows.length === 0 || !rows[0].audio_key) {
        return new Response(null, { status: 404 });
      }

      const blob = await store.get(rows[0].audio_key, { type: "arrayBuffer" });
      if (!blob) {
        return new Response(null, { status: 404 });
      }

      return new Response(blob, {
        status: 200,
        headers: {
          "Content-Type": "audio/mpeg",
          "Cache-Control": "private, no-cache",
        },
      });
    }

    // GET /replacements?passageId=1[&versionId=5|null]
    // versionId=null filters to unversioned (NULL) replacements only
    // No versionId param returns all replacements for the passage
    if (method === "GET") {
      const passageId = Number(url.searchParams.get("passageId"));
      if (!passageId) return jsonRes({ error: "passageId is required" }, 400);

      const versionIdParam = url.searchParams.get("versionId");
      let rows;
      
      if (versionIdParam === "null") {
        // Explicitly filter for unversioned replacements
        rows = await sql`
          SELECT id, title, note, name, selection_start, selection_end, original, version_id
          FROM replacements
          WHERE passage_id = ${passageId} AND version_id IS NULL
          ORDER BY created_at
        `;
      } else if (versionIdParam !== null) {
        // Filter for a specific version
        rows = await sql`
          SELECT id, title, note, name, selection_start, selection_end, original, version_id
          FROM replacements
          WHERE passage_id = ${passageId} AND version_id = ${Number(versionIdParam)}
          ORDER BY created_at
        `;
      } else {
        // No version filter: return all replacements
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
      const title = url.searchParams.get("title") || "";
      const note = url.searchParams.get("note") || "";
      const name = url.searchParams.get("name") || "";
      const selectionStart = Number(url.searchParams.get("selectionStart"));
      const selectionEnd = Number(url.searchParams.get("selectionEnd"));
      const originalParam = url.searchParams.get("original");
      const original = originalParam !== null ? originalParam !== "false" : "true";

      if (!id) return jsonRes({ error: "id is required" }, 400);
      if (!title) return jsonRes({ error: "title is required" }, 400);

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
        await sql`
          UPDATE replacements SET audio_key = ${blobKey} WHERE id = ${id}
        `;
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
        const rows = await sql`SELECT audio_key, original, title, note FROM replacements WHERE id = ${id}`;
        if (rows.length > 0) {
          if (rows[0].audio_key) {
            await store.delete(rows[0].audio_key);
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
        const rows = await sql`
          SELECT audio_key FROM replacements
          WHERE passage_id = ${passageId} AND version_id IS NULL
        `;
        for (const r of rows) {
          if (r.audio_key) await store.delete(r.audio_key);
        }
        await sql`DELETE FROM replacements WHERE passage_id = ${passageId} AND version_id IS NULL`;
        return jsonRes({ success: true });
      }

      return jsonRes({ error: "id or passageId is required" }, 400);
    }

    // PATCH /replacements?passageId=1&versionId=5
    // Bulk-associate all unversioned replacements for a passage with a version
    if (method === "PATCH") {
      const passageId = Number(url.searchParams.get("passageId"));
      const versionId = Number(url.searchParams.get("versionId"));
      if (!passageId) return jsonRes({ error: "passageId is required" }, 400);
      if (!versionId) return jsonRes({ error: "versionId is required" }, 400);

      await sql`
        UPDATE replacements SET version_id = ${versionId}
        WHERE passage_id = ${passageId} AND version_id IS NULL
      `;
      return jsonRes({ success: true });
    }

    return jsonRes({ error: "Method not allowed" }, 405);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("replacements function error:", err);
    return jsonRes({ error: message }, 500);
  }
}
