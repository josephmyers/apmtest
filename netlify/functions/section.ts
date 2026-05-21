import { getDb } from "./db.js";
import {
  handle,
  jsonRes,
  getUser,
  assertPassageAccess,
  HttpError,
} from "./_auth.js";

export default handle(async (req: Request) => {
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");

  const user = getUser(req);
  const sql = getDb();
  const url = new URL(req.url);

  const passageId = Number(url.searchParams.get("passageId"));
  if (!passageId) throw new HttpError(400, "passageId is required");
  await assertPassageAccess(sql, user.userId, passageId);

  const rows = await sql`
    SELECT id, reference, current_step
    FROM passages
    WHERE section_id = (SELECT section_id FROM passages WHERE id = ${passageId})
    ORDER BY sort_order
  `;

  return jsonRes({
    sectionPassages: rows.map((r) => ({
      id: r.id,
      reference: r.reference,
      current_step: r.current_step,
    })),
  });
});
