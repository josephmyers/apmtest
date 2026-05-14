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
  const rows = await sql`SELECT id, email, password_hash FROM users WHERE email = ${email}`;
  if (rows.length === 0 || rows[0].password_hash === null) {
    // Treat pre-invited (no password yet) rows as invalid credentials so we
    // don't leak whether an email was invited.
    throw new HttpError(401, "Invalid email or password");
  }

  const user = rows[0];
  const valid = await bcrypt.compare(password, user.password_hash as string);
  if (!valid) {
    throw new HttpError(401, "Invalid email or password");
  }

  const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, {
    expiresIn: "7d",
  });
  return jsonRes({ token, user: { id: user.id, email: user.email } });
});
