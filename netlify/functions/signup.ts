import { getDb } from "./db.js";
import { handle, jsonRes, HttpError } from "./_auth.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production";

export default handle(async (req: Request) => {
  if (req.method !== "POST") {
    throw new HttpError(405, "Method not allowed");
  }

  const { email: rawEmail, password } = await req.json();
  if (!rawEmail || !password) {
    throw new HttpError(400, "Email and password are required");
  }
  const email = String(rawEmail).trim().toLowerCase();

  const sql = getDb();
  const existing = await sql`SELECT id, password_hash FROM users WHERE email = ${email}`;
  const passwordHash = await bcrypt.hash(password, 10);

  let userId: number;
  if (existing.length === 0) {
    const result = await sql`
      INSERT INTO users (email, password_hash)
      VALUES (${email}, ${passwordHash})
      RETURNING id
    `;
    userId = result[0].id as number;
  } else if (existing[0].password_hash === null) {
    // Pre-invited row: fill in the password to complete signup.
    // team_ids was already populated by whoever invited them.
    await sql`UPDATE users SET password_hash = ${passwordHash} WHERE id = ${existing[0].id}`;
    userId = existing[0].id as number;
  } else {
    throw new HttpError(409, "An account with this email already exists");
  }

  const token = jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: "7d" });
  return jsonRes({ token, user: { id: userId, email } }, 201);
});
