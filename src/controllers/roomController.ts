// src/controllers/roomController.ts
import { Request, Response, NextFunction } from "express";
import * as RoomService from "../services/roomService";

export async function listRooms(req: Request, res: Response, next: NextFunction) {
  try {
    const rows = await RoomService.listRooms();
    res.json(rows);
  } catch (err) { next(err); }
}

export async function createRoom(req: Request, res: Response, next: NextFunction) {
  try {
    const { name, baseHourlyRate, base_hourly_rate, capacity, description } = req.body;
    const rate = baseHourlyRate ?? base_hourly_rate;
    if (!name || rate == null) return res.status(400).json({ error: "name and baseHourlyRate required" });
    const r = await RoomService.createRoom({
      name,
      base_hourly_rate: Number(rate),
      capacity: Number(capacity) || 1,
      description
    });
    res.status(201).json(r);
  } catch (err) { next(err); }
}

export async function updateRoom(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id;
    const payload = req.body;
    const r = await RoomService.updateRoom(id, { name: payload.name, base_hourly_rate: payload.base_hourly_rate, capacity: payload.capacity, description: payload.description });
    if (!r) return res.status(404).json({ error: "Room not found" });
    res.json(r);
  } catch (err) { next(err); }
}

export async function seedRooms(req: Request, res: Response, next: NextFunction) {
  try {
    const rows = await RoomService.seedDemoRooms();
    res.json(rows);
  } catch (err) { next(err); }
}

export async function getRoom(req: Request, res: Response, next: NextFunction) {
  try {
    const r = await RoomService.getRoom(req.params.id);
    if (!r) return res.status(404).json({ error: "Room not found" });
    res.json(r);
  } catch (err) { next(err); }
}

export async function deleteRoom(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id;
    // Optionally: prevent deletion if existing confirmed bookings exist.
    const deleted = await RoomService.deleteRoom(id);
    if (!deleted) return res.status(404).json({ error: "Room not found" });
    res.json({ success: true, deleted });
  } catch (err) { next(err); }
}
