import { getDb } from "./db.js";
import {
  handle,
  jsonRes,
  getUser,
  assertTeamMember,
  HttpError,
} from "./_auth.js";

export default handle(async (req: Request) => {
  const user = getUser(req);
  const sql = getDb();
  const url = new URL(req.url);
  const method = req.method;

  const teamId = Number(url.searchParams.get("teamId"));
  if (!teamId) throw new HttpError(400, "teamId is required");
  await assertTeamMember(sql, user.userId, teamId);

  // GET /team-members?teamId=N — list members (with pending flag)
  if (method === "GET") {
    const members = await sql`
      SELECT id, email, (password_hash IS NULL) AS pending
      FROM users
      WHERE ${teamId} = ANY(team_ids)
      ORDER BY id
    `;
    return jsonRes({
      members: members.map((m) => ({
        userId: m.id,
        email: m.email,
        pending: m.pending,
      })),
    });
  }

  // POST /team-members?teamId=N { email } — add by email
  // If the user doesn't exist yet, create a pending row (password_hash NULL).
  if (method === "POST") {
    const { email: rawEmail } = await req.json();
    if (!rawEmail || typeof rawEmail !== "string" || !rawEmail.trim()) {
      throw new HttpError(400, "email is required");
    }
    const email = rawEmail.trim().toLowerCase();

    const existing = await sql`SELECT id FROM users WHERE email = ${email}`;
    let userId: number;
    if (existing.length === 0) {
      const [row] = await sql`
        INSERT INTO users (email, password_hash, team_ids)
        VALUES (${email}, NULL, ARRAY[${teamId}]::int[])
        RETURNING id
      `;
      userId = row.id as number;
    } else {
      userId = existing[0].id as number;
      // Append only if not already a member (no unique constraint by design).
      await sql`
        UPDATE users SET team_ids = array_append(team_ids, ${teamId})
        WHERE id = ${userId} AND NOT (${teamId} = ANY(team_ids))
      `;
    }

    const [member] = await sql`
      SELECT id, email, (password_hash IS NULL) AS pending FROM users WHERE id = ${userId}
    `;
    return jsonRes(
      {
        member: {
          userId: member.id,
          email: member.email,
          pending: member.pending,
        },
      },
      201,
    );
  }

  // DELETE /team-members?teamId=N&userId=X
  // Self-removal allowed even if last member; the team may end up with only
  // pending (no-password) users until one of them signs up.
  if (method === "DELETE") {
    const targetUserId = Number(url.searchParams.get("userId"));
    if (!targetUserId) throw new HttpError(400, "userId is required");
    await sql`
      UPDATE users SET team_ids = array_remove(team_ids, ${teamId})
      WHERE id = ${targetUserId}
    `;
    return jsonRes({ success: true });
  }

  throw new HttpError(405, "Method not allowed");
});
