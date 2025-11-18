// src/types.ts
export type Room = {
  id: string;
  name: string;
  base_hourly_rate: number;
  capacity: number;
  description?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type Booking = {
  id: string;
  room_id: string;
  user_name: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  total_price: number;
  status: "CONFIRMED" | "CANCELLED";
  created_at?: string;
  updated_at?: string;
};
