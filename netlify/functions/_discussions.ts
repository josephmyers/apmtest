import { getStore } from "@netlify/blobs";
import { getDb } from "./db.js";
import { HttpError } from "./_auth.js";

type Sql = ReturnType<typeof getDb>;
type Store = ReturnType<typeof getStore>;

// Parse the optional `links` query param (URL-encoded JSON array). Invalid input
// degrades to an empty array rather than failing the request.
export function parseLinks(raw: string | null): unknown[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

// A message's content: raw audio bytes (?audio=1) or JSON `{ text }`. Exactly one
// is returned; throws 400 when the chosen form is missing.
export async function readMessageContent(
  req: Request,
  isAudio: boolean,
): Promise<{ body: string | null; audioBuf: ArrayBuffer | null }> {
  if (isAudio) {
    const buf = await req.arrayBuffer();
    if (!buf || buf.byteLength === 0) throw new HttpError(400, "audio body is required");
    return { body: null, audioBuf: buf };
  }
  const json = (await req.json().catch(() => ({}))) as { text?: string };
  const body = (json.text || "").trim();
  if (!body) throw new HttpError(400, "message text is required");
  return { body, audioBuf: null };
}

// Store a message's audio under the canonical blob key and return that key.
export async function storeMessageBlob(
  store: Store,
  messageId: number,
  audioBuf: ArrayBuffer,
  userId: number,
): Promise<string> {
  const blobKey = `discussion-message-${messageId}.mp3`;
  await store.set(blobKey, audioBuf, {
    metadata: { discussionMessageId: String(messageId), uploadedBy: String(userId) },
  });
  return blobKey;
}

// Insert a message (plus its audio blob, if any) and return the new id.
export async function createMessage(
  sql: Sql,
  store: Store,
  args: {
    discussionId: number;
    authorId: number;
    body: string | null;
    audioBuf: ArrayBuffer | null;
    links: unknown[];
  },
): Promise<number> {
  const rows = await sql`
    INSERT INTO discussion_messages (discussion_id, author_id, body, links)
    VALUES (${args.discussionId}, ${args.authorId}, ${args.body}, ${JSON.stringify(args.links)}::jsonb)
    RETURNING id
  `;
  const id = rows[0].id as number;
  if (args.audioBuf) {
    const blobKey = await storeMessageBlob(store, id, args.audioBuf, args.authorId);
    await sql`UPDATE discussion_messages SET audio_key = ${blobKey} WHERE id = ${id}`;
  }
  return id;
}
