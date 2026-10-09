-- =============================================================================
-- DEMONSTRATION DATA — every row is flagged is_demo = true.
-- Fictional inventory quantities and projects so the app has something to show.
-- It contains NO real student data. Replace it with the lab's real inventory:
--   delete from public.projects where is_demo;  -- cascades to components
--   delete from public.inventory_items where is_demo;  (after removing dependants)
-- or simply archive the demo items from the admin screen.
-- Safe to run once on an empty database; it is not idempotent by design.
-- =============================================================================
begin;

insert into public.inventory_categories (name, sort_order) values
  ('Microcontrollers', 1), ('Sensors', 2), ('Motors & Drivers', 3), ('Displays', 4),
  ('Communication', 5), ('Power', 6), ('Prototyping', 7);

-- name, category, brand, location, total, available, borrowed, damaged, lost, low-stock threshold
-- Borrowed is 0 everywhere: on-loan stock only ever comes from real borrowings, so the
-- dashboard's "on loan" and "active loans" always agree. The two short items are
-- short because units are damaged (awaiting repair), which demonstrates readiness < 100%.
create temp table _items (name text, cat text, brand text, loc text,
  total int, avail int, borr int, dmg int, lost int, thr int) on commit drop;
insert into _items values
 ('Arduino Uno R3','Microcontrollers','Arduino','Shelf A1',20,18,0,1,1,3),
 ('ESP32 DevKit V1','Microcontrollers','Espressif','Shelf A2',15,14,0,1,0,3),
 ('Raspberry Pi Pico','Microcontrollers','Raspberry Pi','Shelf A3',10,10,0,0,0,2),
 ('HC-SR04 Ultrasonic Sensor','Sensors','Generic','Shelf B1',25,24,0,1,0,4),
 ('DHT11 Temperature & Humidity Sensor','Sensors','Generic','Shelf B2',20,20,0,0,0,3),
 ('IR Obstacle Sensor','Sensors','Generic','Shelf B3',20,20,0,0,0,3),
 ('MPU6050 Accelerometer/Gyro','Sensors','InvenSense','Shelf B4',8,8,0,0,0,2),
 ('PIR Motion Sensor HC-SR501','Sensors','Generic','Shelf B5',10,10,0,0,0,2),
 ('Soil Moisture Sensor','Sensors','Generic','Shelf B6',10,10,0,0,0,2),
 ('L298N Motor Driver','Motors & Drivers','ST','Shelf C1',2,0,0,2,0,2),
 ('SG90 Micro Servo','Motors & Drivers','TowerPro','Shelf C2',20,20,0,0,0,4),
 ('DC Gear Motor with Wheel','Motors & Drivers','Generic','Shelf C3',30,30,0,0,0,4),
 ('Robot Chassis 2WD','Motors & Drivers','Generic','Shelf C4',8,8,0,0,0,2),
 ('28BYJ-48 Stepper + ULN2003','Motors & Drivers','Generic','Shelf C5',8,8,0,0,0,2),
 ('0.96" OLED Display (I2C)','Displays','Generic','Shelf D1',12,12,0,0,0,2),
 ('16x2 LCD with I2C Backpack','Displays','Generic','Shelf D2',12,12,0,0,0,2),
 ('HC-05 Bluetooth Module','Communication','Generic','Shelf E1',8,8,0,0,0,2),
 ('NRF24L01 Radio Module','Communication','Nordic','Shelf E2',3,1,0,2,0,2),
 ('5V Relay Module','Power','Generic','Shelf F1',10,10,0,0,0,2),
 ('18650 Battery Holder (2-cell)','Power','Generic','Shelf F2',12,12,0,0,0,2),
 ('LM2596 Buck Converter','Power','Generic','Shelf F3',8,8,0,0,0,2),
 ('830-point Breadboard','Prototyping','Generic','Shelf G1',30,30,0,0,0,5),
 ('Jumper Wire Pack (40 pcs)','Prototyping','Generic','Shelf G2',40,40,0,0,0,6),
 ('Piezo Buzzer','Prototyping','Generic','Shelf G3',20,20,0,0,0,4);

insert into public.inventory_items
  (name, category_id, brand_model, storage_location, total_qty, available_qty, borrowed_qty,
   damaged_qty, lost_qty, low_stock_threshold, is_demo, asset_ids, description)
select i.name, c.id, i.brand, i.loc, i.total, i.avail, i.borr, i.dmg, i.lost, i.thr, true,
       'DEMO-' || lpad((row_number() over (order by i.name))::text, 3, '0'),
       'Demonstration item. ' || i.name || ' — replace with real inventory.'
from _items i join public.inventory_categories c on c.name = i.cat;

create temp table _proj (name text, slug text, cat text, diff public.project_difficulty,
  hmin numeric, hmax numeric, descr text, status public.project_status) on commit drop;
insert into _proj values
 ('Obstacle Avoiding Robot','obstacle-avoiding-robot','Robotics','beginner',3,5,'A two-wheeled robot that senses obstacles with ultrasound and steers around them.','published'),
 ('Smart Home Automation','smart-home-automation','IoT','intermediate',5,8,'Control relays and read temperature and motion from an ESP32.','published'),
 ('Weather Station','weather-station','IoT','beginner',2,4,'Log temperature and humidity and show them on an OLED.','published'),
 ('Bluetooth Controlled Car','bluetooth-controlled-car','Robotics','intermediate',4,6,'Drive a chassis from your phone over Bluetooth.','published'),
 ('Servo Radar','servo-radar','Sensors','beginner',2,3,'Sweep an ultrasonic sensor on a servo and plot what it sees.','published'),
 ('Gesture Controlled Arm','gesture-controlled-arm','Robotics','advanced',8,12,'Mirror hand movement on a servo arm using IMUs and a radio link.','published'),
 ('Plant Monitor','plant-monitor','IoT','beginner',2,4,'Measure soil moisture and switch a pump through a relay.','published'),
 ('Line Follower Robot','line-follower-robot','Robotics','intermediate',4,6,'Follow a black line with IR sensors and a motor driver.','published'),
 ('RFID Door Lock (draft)','rfid-door-lock','Security','intermediate',null,null,'Work in progress — components not yet decided.','draft');

-- Components first need a project row; publish guard needs components, so insert
-- as draft, add components, then publish.
insert into public.projects (name, slug, category, difficulty, est_hours_min, est_hours_max, description, status, is_demo)
select name, slug, cat, diff, hmin, hmax, descr, 'draft', true from _proj;

create temp table _pc (slug text, item text, qty int) on commit drop;
insert into _pc values
 ('obstacle-avoiding-robot','Arduino Uno R3',1),
 ('obstacle-avoiding-robot','HC-SR04 Ultrasonic Sensor',1),
 ('obstacle-avoiding-robot','L298N Motor Driver',1),
 ('obstacle-avoiding-robot','Robot Chassis 2WD',1),
 ('obstacle-avoiding-robot','18650 Battery Holder (2-cell)',1),
 ('smart-home-automation','ESP32 DevKit V1',1),
 ('smart-home-automation','5V Relay Module',2),
 ('smart-home-automation','DHT11 Temperature & Humidity Sensor',1),
 ('smart-home-automation','PIR Motion Sensor HC-SR501',1),
 ('smart-home-automation','LM2596 Buck Converter',1),
 ('weather-station','Arduino Uno R3',1),
 ('weather-station','DHT11 Temperature & Humidity Sensor',1),
 ('weather-station','0.96" OLED Display (I2C)',1),
 ('weather-station','830-point Breadboard',1),
 ('weather-station','Jumper Wire Pack (40 pcs)',1),
 ('bluetooth-controlled-car','Arduino Uno R3',1),
 ('bluetooth-controlled-car','HC-05 Bluetooth Module',1),
 ('bluetooth-controlled-car','L298N Motor Driver',1),
 ('bluetooth-controlled-car','Robot Chassis 2WD',1),
 ('bluetooth-controlled-car','DC Gear Motor with Wheel',2),
 ('bluetooth-controlled-car','18650 Battery Holder (2-cell)',1),
 ('servo-radar','Arduino Uno R3',1),
 ('servo-radar','SG90 Micro Servo',1),
 ('servo-radar','HC-SR04 Ultrasonic Sensor',1),
 ('servo-radar','0.96" OLED Display (I2C)',1),
 ('servo-radar','830-point Breadboard',1),
 ('gesture-controlled-arm','ESP32 DevKit V1',2),
 ('gesture-controlled-arm','MPU6050 Accelerometer/Gyro',2),
 ('gesture-controlled-arm','SG90 Micro Servo',4),
 ('gesture-controlled-arm','NRF24L01 Radio Module',2),
 ('gesture-controlled-arm','LM2596 Buck Converter',1),
 ('gesture-controlled-arm','830-point Breadboard',2),
 ('plant-monitor','ESP32 DevKit V1',1),
 ('plant-monitor','Soil Moisture Sensor',2),
 ('plant-monitor','0.96" OLED Display (I2C)',1),
 ('plant-monitor','5V Relay Module',1),
 ('line-follower-robot','Arduino Uno R3',1),
 ('line-follower-robot','IR Obstacle Sensor',2),
 ('line-follower-robot','L298N Motor Driver',1),
 ('line-follower-robot','Robot Chassis 2WD',1),
 ('line-follower-robot','18650 Battery Holder (2-cell)',1);

insert into public.project_components (project_id, item_id, qty_required)
select p.id, i.id, pc.qty
from _pc pc
join public.projects p on p.slug = pc.slug
join public.inventory_items i on i.name = pc.item;

update public.projects p set status = 'published'
from _proj s where s.slug = p.slug and s.status = 'published';

commit;
