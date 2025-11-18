-- seed.sql
INSERT INTO rooms (id, name, base_hourly_rate, capacity, description)
VALUES
('101','Cabin 1', 350.00, 4, 'Cozy cabin with whiteboard & monitor'),
('102','Focus Room', 275.00, 2, 'Small focus room'),
('103','Conference Hall', 1200.00, 20, 'Large room with projector'),
('104','Workshop Space', 800.00, 12, 'Open layout for workshops')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, base_hourly_rate = EXCLUDED.base_hourly_rate, capacity = EXCLUDED.capacity, description = EXCLUDED.description, updated_at = now();
