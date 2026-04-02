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

    // POST /passage-versions?passageId=123&renderSource=...&activate=1
    // Body: audio blob
    // renderSource: if provided, this is an AI-rendered version (links to source audio key)
    if (method === "POST") {
      const passageId = Number(url.searchParams.get("passageId"));
      if (!passageId) return jsonRes({ error: "passageId is required" }, 400);

      let renderSource = url.searchParams.get("renderSource") || null;
      const activate = url.searchParams.get("activate") !== "0";

      const isRendered = renderSource !== null;

      const body = await req.arrayBuffer();
      if (!body || body.byteLength === 0) {
        return jsonRes({ error: "No audio data provided" }, 400);
      }

      if (body.byteLength > 5.5 * 1024 * 1024) {
        return jsonRes({ error: "Audio file too large (max 5.5 MB)" }, 413);
      }

      // Insert version row to get its ID
      const [version] = await sql`
        INSERT INTO passage_versions (passage_id, audio_key, render_source)
        VALUES (${passageId}, '', ${renderSource})
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

      // Update the version row with the actual blob key
      await sql`
        UPDATE passage_versions SET audio_key = ${blobKey} WHERE id = ${version.id}
      `;

      // Optionally activate this version as the passage's current audio
      if (activate) {
        const speaker = url.searchParams.get("speaker");
        if (speaker) {
          await sql`
            UPDATE passages SET audio_key = ${blobKey}, speaker = ${speaker} WHERE id = ${passageId}
          `;
        } else {
          await sql`
            UPDATE passages SET audio_key = ${blobKey} WHERE id = ${passageId}
          `;
        }
      }

      return jsonRes({
        version: {
          id: version.id,
          passageId,
          audioKey: blobKey,
          renderSource,
          note: "",
          createdAt: version.created_at,
        },
      });
    }

    // PATCH /passage-versions?id=123 — activate a version
    if (method === "PATCH") {
      const versionId = Number(url.searchParams.get("id"));
      if (!versionId) return jsonRes({ error: "id is required" }, 400);

      const [version] = await sql`
        SELECT id, passage_id, audio_key FROM passage_versions WHERE id = ${versionId}
      `;
      if (!version) return jsonRes({ error: "Version not found" }, 404);

      await sql`
        UPDATE passages SET audio_key = ${version.audio_key} WHERE id = ${version.passage_id}
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
        const [version] = await sql`
          SELECT audio_key FROM passage_versions WHERE id = ${versionId}
        `;
        if (!version) return jsonRes({ error: "Version not found" }, 404);

        const blob = await store.get(version.audio_key, { type: "arrayBuffer" });
        if (!blob) return jsonRes({ error: "Audio not found" }, 404);

        const contentType = String(version.audio_key).endsWith(".wav")
          ? "audio/wav"
          : "audio/mpeg";

        return new Response(blob, {
          status: 200,
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "private, no-cache",
          },
        });
      }

      if (!passageId) return jsonRes({ error: "passageId is required" }, 400);

      // Fetch the passage's current active audio blob
      if (wantAudio) {
        const [passage] = await sql`
          SELECT audio_key FROM passages WHERE id = ${passageId}
        `;
        if (!passage?.audio_key) {
          return jsonRes({ error: "No audio found for this passage" }, 404);
        }

        const blob = await store.get(passage.audio_key, { type: "arrayBuffer" });
        if (!blob) {
          return jsonRes({ error: "No audio found for this passage" }, 404);
        }

        const contentType = String(passage.audio_key).endsWith(".wav")
          ? "audio/wav"
          : "audio/mpeg";

        return new Response(blob, {
          status: 200,
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "private, no-cache",
          },
        });
      }

      // List all versions
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

    // DELETE /passage-versions?passageId=123 — remove the passage's current audio
    if (method === "DELETE") {
      const passageId = Number(url.searchParams.get("passageId"));
      if (!passageId) return jsonRes({ error: "passageId is required" }, 400);

      const [passage] = await sql`
        SELECT audio_key FROM passages WHERE id = ${passageId}
      `;
      if (passage?.audio_key) {
        await store.delete(passage.audio_key);
      }

      await sql`
        UPDATE passages SET audio_key = NULL WHERE id = ${passageId}
      `;

      return jsonRes({ success: true });
    }

    return jsonRes({ error: "Method not allowed" }, 405);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("passage-versions function error:", err);
    return jsonRes({ error: message }, 500);
  }
}
