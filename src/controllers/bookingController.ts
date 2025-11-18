// src/controllers/bookingController.ts
import { Request, Response, NextFunction } from "express";
import * as BookingService from "../services/bookingService";

export async function createBooking(req: Request, res: Response, next: NextFunction) {
  try {
    const { roomId, userName, startTime, endTime } = req.body;
    if (!roomId || !userName || !startTime || !endTime) return res.status(400).json({ error: "roomId, userName, startTime, endTime required" });

    const result = await BookingService.createBooking({ roomId, userName, startTimeIso: startTime, endTimeIso: endTime });
    res.status(201).json({
      bookingId: result.bookingId,
      roomId: result.roomId,
      userName: result.userName,
      totalPrice: result.totalPrice,
      status: result.status,
      startTime: result.startTime,
      endTime: result.endTime
    });
  } catch (err: any) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
}

export async function getBooking(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id;
    const b = await BookingService.getBooking(id);
    if (!b) return res.status(404).json({ error: "Booking not found" });
    res.json(b);
  } catch (err) { next(err); }
}

export async function listBookings(req: Request, res: Response, next: NextFunction) {
  try {
    const { from, to, roomId } = req.query;
    const rows = await BookingService.listBookings({ from: typeof from === "string" ? from : undefined, to: typeof to === "string" ? to : undefined, roomId: typeof roomId === "string" ? roomId : undefined });
    res.json(rows);
  } catch (err) { next(err); }
}

export async function cancelBooking(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id;
    const r = await BookingService.cancelBooking(id);
    res.json(r);
  } catch (err: any) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
}
