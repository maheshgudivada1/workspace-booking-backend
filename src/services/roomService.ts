// src/services/roomService.ts
import { query } from "../db";
import { Room } from "../types";

/** List rooms */
export async function listRooms(): Promise<Room[]> {
  const res = await query("SELECT id, name, base_hourly_rate, capacity, description, created_at, updated_at FROM rooms ORDER BY name");
  return res.rows;
}

export async function getRoom(id: string): Promise<Room | null> {
  const res = await query("SELECT id, name, base_hourly_rate, capacity, description, created_at, updated_at FROM rooms WHERE id = $1", [id]);
  return res.rows[0] || null;
}

export async function createRoom(payload: { id?: string; name: string; base_hourly_rate: number; capacity: number; description?: string }) {
  const id = payload.id || String(Math.floor(Math.random() * 900000 + 100000));
  const res = await query(
    `INSERT INTO rooms (id, name, base_hourly_rate, capacity, description) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, base_hourly_rate=EXCLUDED.base_hourly_rate, capacity=EXCLUDED.capacity, description=EXCLUDED.description, updated_at=now()
     RETURNING id, name, base_hourly_rate, capacity, description, created_at, updated_at`,
    [id, payload.name, payload.base_hourly_rate, payload.capacity, payload.description || null]
  );
  return res.rows[0];
}

export async function updateRoom(id: string, payload: { name?: string; base_hourly_rate?: number; capacity?: number; description?: string }) {
  const res = await query(
    `UPDATE rooms SET
       name = COALESCE($2, name),
       base_hourly_rate = COALESCE($3, base_hourly_rate),
       capacity = COALESCE($4, capacity),
       description = COALESCE($5, description),
       updated_at = now()
     WHERE id = $1
     RETURNING id, name, base_hourly_rate, capacity, description, created_at, updated_at`,
    [id, payload.name, payload.base_hourly_rate, payload.capacity, payload.description]
  );
  return res.rows[0];
}

export async function seedDemoRooms() {
  const demo = [
    { id: "101", name: "Cabin 1", base_hourly_rate: 350.0, capacity: 4, description: "Cozy cabin with whiteboard & monitor" },
    { id: "102", name: "Focus Room", base_hourly_rate: 275.0, capacity: 2, description: "Small focus room" },
    { id: "103", name: "Conference Hall", base_hourly_rate: 1200.0, capacity: 20, description: "Large room with projector" },
    { id: "104", name: "Workshop Space", base_hourly_rate: 800.0, capacity: 12, description: "Open layout for workshops" }
  ];
  for (const r of demo) {
    await createRoom(r);
  }
  return listRooms();
}

/** Delete a room by id. Returns deleted row info or null if not found */
export async function deleteRoom(id: string) {
  // Optionally: block delete if confirmed bookings exist:
  // const conflict = await query("SELECT COUNT(*)::int as c FROM bookings WHERE room_id=$1 AND status='CONFIRMED'", [id]);
  // if (conflict.rows[0].c > 0) throw { status: 400, message: "Cannot delete room with confirmed bookings" };

  const res = await query(
    `DELETE FROM rooms WHERE id = $1 RETURNING id, name, base_hourly_rate, capacity, description`,
    [id]
  );
  if (res.rowCount === 0) return null;
  return res.rows[0];
}
