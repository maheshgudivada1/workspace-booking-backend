// src/controllers/analyticsController.ts
import { Request, Response, NextFunction } from "express";
import { query } from "../db";

/**
 * GET /api/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Uses IST date boundaries (00:00 IST .. 23:59:59 IST) converted to UTC.
 */
function istDateToUtcRange(dateStr: string) {
  // dateStr expected YYYY-MM-DD
  const [y, m, d] = dateStr.split("-").map(Number);
  // IST midnight -> UTC = IST - 5:30
  const istStart = Date.UTC(y, m - 1, d, 0, 0);
  const utcStart = new Date(istStart - ((5 * 60 + 30) * 60 * 1000)).toISOString();
  const istEnd = Date.UTC(y, m - 1, d, 23, 59, 59, 999);
  const utcEnd = new Date(istEnd - ((5 * 60 + 30) * 60 * 1000)).toISOString();
  return { utcStart, utcEnd };
}

export async function getAnalytics(req: Request, res: Response, next: NextFunction) {
  try {
    const from = typeof req.query.from === "string" ? req.query.from : undefined;
    const to = typeof req.query.to === "string" ? req.query.to : undefined;
    // default: last 7 days (IST)
    let fromUtc: string | undefined;
    let toUtc: string | undefined;
    if (from) {
      fromUtc = istDateToUtcRange(from).utcStart;
    }
    if (to) {
      toUtc = istDateToUtcRange(to).utcEnd;
    }
    // When both provided, compute revenue and total hours per room from CONFIRMED bookings overlapping the date range.
    // We'll include bookings that start or end within the window
    const params: any[] = [];
    let where = " WHERE status = 'CONFIRMED' ";
    if (fromUtc) { params.push(fromUtc); where += ` AND end_time >= $${params.length}`; }
    if (toUtc) { params.push(toUtc); where += ` AND start_time <= $${params.length}`; }

    const q = `
      SELECT r.id as "roomId", r.name as "roomName",
        SUM( (EXTRACT(EPOCH FROM (LEAST(b.end_time, COALESCE($2::timestamptz, b.end_time)) - GREATEST(b.start_time, COALESCE($1::timestamptz, b.start_time))) ) / 3600) ) AS total_hours,
        SUM(b.total_price) FILTER (WHERE b.status = 'CONFIRMED') as total_revenue
      FROM rooms r
      LEFT JOIN bookings b ON b.room_id = r.id ${where}
      GROUP BY r.id, r.name
      ORDER BY r.name
    `;
    // Important: We need to pass fromUtc,toUtc positions consistent; just pass nulls if absent
    const p1 = fromUtc || null;
    const p2 = toUtc || null;
    const result = await query(q, [p1, p2]);
    const rows = result.rows.map((r: any) => ({
      roomId: r.roomId,
      roomName: r.roomName,
      totalHours: Number(Number(r.total_hours || 0).toFixed(2)),
      totalRevenue: Number(Number(r.total_revenue || 0).toFixed(2))
    }));
    res.json(rows);
  } catch (err) { next(err); }
}
