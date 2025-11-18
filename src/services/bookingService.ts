// src/services/bookingService.ts
import { pool, query } from "../db";
import { estimatePriceForInterval } from "../utils/time";
import { Booking } from "../types";

/**
 * Booking service
 *
 * - Uses SERIALIZABLE transactions with retries to avoid races.
 * - Defensive client release on all paths.
 * - Conflict detection: new.start < existing.end AND new.end > existing.start
 */

const TX_RETRIES = Number(process.env.BOOKING_TX_RETRIES || 3);

/** Utility to normalize DB timestamp values to ISO string (defensive) */
function toIso(value: any, fallback?: string) {
  try {
    if (!value) return fallback ?? null;
    // value from pg is usually a Date object; if string, Date will parse it.
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return fallback ?? null;
    return d.toISOString();
  } catch {
    return fallback ?? null;
  }
}

export async function createBooking(params: {
  roomId: string;
  userName: string;
  startTimeIso: string; // UTC ISO string
  endTimeIso: string;   // UTC ISO string
}): Promise<{
  bookingId: string;
  roomId: string;
  userName: string;
  totalPrice: number;
  status: string;
  startTime: string;
  endTime: string;
}> {
  // basic validation
  if (!params.roomId || !params.userName || !params.startTimeIso || !params.endTimeIso) {
    throw { status: 400, message: "roomId, userName, startTimeIso, endTimeIso are required" };
  }

  const start = new Date(params.startTimeIso);
  const end = new Date(params.endTimeIso);
  if (!(start < end)) throw { status: 400, message: "startTime must be before endTime" };

  const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60000);
  if (durationMinutes > 12 * 60) throw { status: 400, message: "Maximum booking duration is 12 hours" };

  // load room base rate
  const roomRes = await query("SELECT id, base_hourly_rate FROM rooms WHERE id = $1", [params.roomId]);
  if (roomRes.rowCount === 0) throw { status: 404, message: "Room not found" };
  const baseHourlyRate = Number(roomRes.rows[0].base_hourly_rate);

  // pricing (server authoritative)
  const pricing = estimatePriceForInterval(baseHourlyRate, start, end);

  // Transaction with retries
  for (let attempt = 1; attempt <= TX_RETRIES; attempt++) {
    const client = await pool.connect();
    let committedOrRolledBack = false;
    try {
      await client.query("BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE");

      // conflict detection - find any confirmed booking that overlaps
      const conflictQ = `
        SELECT id, start_time, end_time
        FROM bookings
        WHERE room_id = $1
          AND status = 'CONFIRMED'
          AND ($2 < end_time) AND ($3 > start_time)
        LIMIT 1
      `;
      const conflictRes = await client.query(conflictQ, [params.roomId, params.startTimeIso, params.endTimeIso]);

      if ((conflictRes?.rowCount ?? 0) > 0) {
        const row = conflictRes.rows[0];
        const s = toIso(row.start_time, "unknown");
        const e = toIso(row.end_time, "unknown");
        // rollback, release, then throw user-friendly error
        await client.query("ROLLBACK");
        committedOrRolledBack = true;
        client.release();
        throw { status: 409, message: `Room already booked from ${s} to ${e}` };
      }

      // Insert booking
      const bookingId = `b${Math.random().toString(36).slice(2, 9)}`;
      const insertQ = `
        INSERT INTO bookings (id, room_id, user_name, start_time, end_time, duration_minutes, total_price, status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,'CONFIRMED')
        RETURNING id, room_id AS "roomId", user_name AS "userName", total_price, status, start_time, end_time
      `;
      const insertRes = await client.query(insertQ, [
        bookingId,
        params.roomId,
        params.userName,
        params.startTimeIso,
        params.endTimeIso,
        durationMinutes,
        pricing.total
      ]);

      await client.query("COMMIT");
      committedOrRolledBack = true;
      client.release();

      const br = insertRes.rows[0];
      return {
        bookingId: br.id,
        roomId: br.roomId,
        userName: br.userName,
        totalPrice: Number(br.total_price),
        status: br.status,
        startTime: toIso(br.start_time, params.startTimeIso) ?? params.startTimeIso,
        endTime: toIso(br.end_time, params.endTimeIso) ?? params.endTimeIso
      };
    } catch (err: any) {
      // Try rollback if not already done
      try {
        if (!committedOrRolledBack) await client.query("ROLLBACK");
      } catch (_) {
        // ignore rollback errors
      }

      // Serialization failure handling (Postgres SQLSTATE 40001)
      const pgcode = err && (err.code || err.sqlState);
      if (pgcode === "40001" && attempt < TX_RETRIES) {
        // release and retry after small backoff
        client.release();
        const backoffMs = 50 * attempt; // simple backoff
        await new Promise((r) => setTimeout(r, backoffMs));
        continue;
      }

      // ensure client released
      client.release();

      // Re-throw structured errors (with status/message) or raw error for logging upstream
      if (err && (err.status || err.message)) throw err;
      throw { status: 500, message: err?.message || "Failed to create booking" };
    }
  }

  // If we get here, retries exhausted
  throw { status: 500, message: "Could not create booking due to concurrent load, please try again" };
}

export async function getBooking(id: string) {
  const res = await query(
    `SELECT id AS bookingId, room_id AS roomId, user_name AS userName, start_time, end_time, duration_minutes, total_price, status
     FROM bookings WHERE id = $1`,
    [id]
  );
  if (res.rowCount === 0) return null;
  const r = res.rows[0];
  return {
    bookingId: r.bookingid || r.bookingId || r.id,
    roomId: r.roomid || r.roomId || r.room_id,
    userName: r.username || r.userName || r.user_name,
    startTime: toIso(r.start_time) ?? null,
    endTime: toIso(r.end_time) ?? null,
    duration_minutes: r.duration_minutes,
    totalPrice: Number(r.total_price),
    status: r.status
  } as any;
}

export async function listBookings({ from, to, roomId }: { from?: string; to?: string; roomId?: string }) {
  const params: any[] = [];
  const where: string[] = [];

  if (from) {
    const [y, m, d] = from.split("-").map(Number);
    if ([y, m, d].some((v) => Number.isNaN(v))) throw { status: 400, message: "Invalid from date" };
    const fromUtc = new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - (5 * 60 + 30) * 60 * 1000).toISOString();
    where.push(`start_time >= $${params.length + 1}`);
    params.push(fromUtc);
  }

  if (to) {
    const [y, m, d] = to.split("-").map(Number);
    if ([y, m, d].some((v) => Number.isNaN(v))) throw { status: 400, message: "Invalid to date" };
    const toUtc = new Date(Date.UTC(y, m - 1, d, 23, 59, 59) - (5 * 60 + 30) * 60 * 1000).toISOString();
    where.push(`end_time <= $${params.length + 1}`);
    params.push(toUtc);
  }

  if (roomId) {
    where.push(`room_id = $${params.length + 1}`);
    params.push(roomId);
  }

  const whereClause = where.length ? "WHERE " + where.join(" AND ") : "";
  const q = `SELECT id AS bookingId, room_id AS roomId, user_name AS userName, start_time, end_time, duration_minutes, total_price, status
             FROM bookings ${whereClause} ORDER BY start_time DESC LIMIT 500`;
  const res = await query(q, params);
  return res.rows.map((r: any) => ({
    bookingId: r.bookingid || r.bookingId || r.id,
    roomId: r.roomid || r.roomId || r.room_id,
    roomName: r.room_name || r.roomName || null,
    userName: r.username || r.userName || r.user_name,
    startTime: toIso(r.start_time),
    endTime: toIso(r.end_time),
    duration_minutes: r.duration_minutes,
    totalPrice: Number(r.total_price),
    status: r.status
  }));
}

export async function cancelBooking(id: string) {
  const res = await query("SELECT id, start_time, status FROM bookings WHERE id = $1", [id]);
  if (res.rowCount === 0) throw { status: 404, message: "Booking not found" };
  const row = res.rows[0];
  if (row.status === "CANCELLED") return { success: true, bookingId: id, status: "CANCELLED" };

  const startIso = toIso(row.start_time);
  if (!startIso) throw { status: 500, message: "Invalid booking start time" };
  const start = new Date(startIso);
  const now = new Date();
  const diffMs = start.getTime() - now.getTime();
  if (diffMs <= 2 * 60 * 60 * 1000) throw { status: 400, message: "Cancellation allowed only if > 2 hours before start time" };

  const upd = await query("UPDATE bookings SET status='CANCELLED', updated_at = now() WHERE id = $1 RETURNING id AS bookingId, status", [id]);
  return upd.rows[0];
}
