// src/db.ts
import { Pool } from "pg";
import dotenv from "dotenv";
dotenv.config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL not set in environment");
}

export const pool = new Pool({
  connectionString,
  // If using Neon, you may need ssl; Node-PG auto-negotiates. If required uncomment:
  // ssl: { rejectUnauthorized: false }
});

export async function query(text: string, params?: any[]) {
  const res = await pool.query(text, params);
  return res;
}
