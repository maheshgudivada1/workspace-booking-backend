// src/routes.ts
import express from "express";
import * as RoomCtrl from "./controllers/roomController";
import * as BookingCtrl from "./controllers/bookingController";
import * as AnalyticsCtrl from "./controllers/analyticsController";

const router = express.Router();

// Rooms
router.get("/rooms", RoomCtrl.listRooms);
router.post("/rooms", RoomCtrl.createRoom);
router.post("/rooms/seed", RoomCtrl.seedRooms);
router.get("/rooms/:id", RoomCtrl.getRoom);
router.put("/rooms/:id", RoomCtrl.updateRoom);
router.delete("/rooms/:id", RoomCtrl.deleteRoom);
// Bookings
router.post("/bookings", BookingCtrl.createBooking);
router.get("/bookings", BookingCtrl.listBookings);
router.get("/bookings/:id", BookingCtrl.getBooking);
router.post("/bookings/:id/cancel", BookingCtrl.cancelBooking);

// Analytics
router.get("/analytics", AnalyticsCtrl.getAnalytics);

export default router;
