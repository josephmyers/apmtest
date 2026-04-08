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

function json(data: unknown, status = 200) {
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

  const sql = getDb();
  const url = new URL(req.url);

  // GET /passage?passageId=123
  if (req.method === "GET") {
    const passageId = Number(url.searchParams.get("passageId"));
    if (!passageId) return json({ error: "passageId is required" }, 400);

    if (url.searchParams.get("unversionedAudio") === "1") {
      const rows = await sql`SELECT unversioned_rendering FROM passages WHERE id = ${passageId}`;
      if (!rows[0]?.unversioned_rendering) return new Response(null, { status: 200 });
      const store = getStore("audio");
      const blob = await store.get(rows[0].unversioned_rendering, { type: "arrayBuffer" });
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

    if (rows.length === 0) return json({ error: "Passage not found" }, 404);

    const p = rows[0];
    return json({
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
      }
    });
  }

  // PUT /passage?passageId=123 — store staged rendering blob
  if (req.method === "PUT") {
    const passageId = Number(url.searchParams.get("passageId"));
    if (!passageId) return json({ error: "passageId is required" }, 400);

    const body = await req.arrayBuffer();
    if (!body || body.byteLength === 0) return json({ error: "No audio data provided" }, 400);

    const store = getStore("audio");
    const stagedKey = `passage-${passageId}-staged.wav`;
    await store.set(stagedKey, body as ArrayBuffer, {
      metadata: { passageId: String(passageId), uploadedBy: String(user.userId) },
    });
    await sql`UPDATE passages SET unversioned_rendering = ${stagedKey} WHERE id = ${passageId}`;
    return json({ success: true });
  }

  return json({ error: "Method not allowed" }, 405);
}
