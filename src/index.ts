// src/index.ts
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import fs from "fs";
import path from "path";
import routes from "./routes";
import { pool } from "./db";

dotenv.config();

const app = express();
app.use(express.json());

// CORS (dev-friendly). Lock down in production.
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Health
app.get("/health", (_, res) => {
  res.json({ status: "ok", now: new Date().toISOString() });
});

/**
 * DEV MIGRATION + SEED
 * - Runs schema.sql always (it uses IF NOT EXISTS so safe)
 * - Runs seed.sql only if rooms table is empty
 * - Only when NODE_ENV !== 'production' (you can change this behavior)
 */
async function ensureSchemaAndSeed() {
  if (process.env.NODE_ENV === "production") {
    console.log("Production mode: skipping automatic schema/seed.");
    return;
  }

  const schemaPath = path.join(__dirname, "..", "schema.sqlschema.sql");
  const seedPath = path.join(__dirname, "..", "seed.sql");

  try {
    if (!process.env.DATABASE_URL) {
      console.warn("DATABASE_URL not set — skipping automatic schema/seed.");
      return;
    }

    console.log("Applying schema (schema.sql)...");
    const schemaSql = fs.readFileSync(schemaPath, "utf8");
    // Execute schema SQL. schema.sql uses IF NOT EXISTS.
    await pool.query(schemaSql);
    console.log("Schema applied (or already exists).");

    // Check if rooms table has any rows. If empty, run seed.
    try {
      const countRes = await pool.query(`SELECT COUNT(*)::int AS c FROM rooms`);
      const count = countRes.rows?.[0]?.c ?? null;
      if (count === null) {
        console.warn("Could not determine rooms count — skipping seed.");
      } else if (count === 0) {
        if (fs.existsSync(seedPath)) {
          console.log("Rooms table empty — applying seed.sql...");
          const seedSql = fs.readFileSync(seedPath, "utf8");
          await pool.query(seedSql);
          console.log("Seed applied.");
        } else {
          console.log("seed.sql not found — skipping seed.");
        }
      } else {
        console.log(`Rooms table already has ${count} rows — skipping seed.`);
      }
    } catch (innerErr) {
      console.warn("Failed to inspect or seed rooms table:", innerErr);
    }
  } catch (err: any) {
    console.error("Failed to apply schema/seed on startup:", err?.message || err);
  }
}

// Run schema/seed on startup (non-blocking startup: await it before mounting routes)
(async () => {
  try {
    await ensureSchemaAndSeed();
  } catch (e) {
    console.error("Error in boot migration:", e);
  } finally {
    // After trying migrations, mount routes and start server
    app.use("/api", routes);

    // Global error handler
    app.use((err: any, _req: express.Request, res: express.Response, _next: any) => {
      console.error("Unhandled error:", err);
      const status = err.status || 500;
      res.status(status).json({ error: err.message || "Internal server error" });
    });

    const PORT = process.env.PORT || 4000;
    app.listen(PORT, () => {
      console.log(`Backend listening on port ${PORT}`);
    });
  }
})();
