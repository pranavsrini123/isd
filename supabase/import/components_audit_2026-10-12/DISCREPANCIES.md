# COMPONENTS Audit - import review (2026-10-12)

Source: `COMPONENTS Audit.docx`, Intelligent System Design Lab (TP1-1509), 4 pages. Page 1 = special
equipment, pages 2-4 = small components ("Available as of 12/10/2026"). The images in the
document are page-header logos only; all data is in the four tables.

| | Special equipment | Small components | Total |
|---|---|---|---|
| Source rows found | 15 | 88 | 103 |
| Ready (numbers reconcile, no remark, borrowable) | 0 | 39 | 39 |
| Need an admin decision | 15 | 49 | 64 |

**Numbering:** small components are numbered 1-87 but serial 48 is missing
(48 missing) and serials 51 and 58 are each used twice, so there are
88 rows. Rows are therefore keyed by their position in the document, not by serial number.

**Nothing in this report has been corrected.** Original names, quantities and remarks are stored
unchanged in `inventory_source_records` and in `dataset.csv`. The "proposed" values are only a
starting point in the review screen: available = the source's "available" figure, damaged = the
damaged count stated or implied by a "Damaged" remark.

## Quantities that do not reconcile (11)

For small components the check is ISD Lab + old project = available. None of these were adjusted.

| Section | No. | Item (as written) | Quantities | Remarks | Note |
|---|---|---|---|---|---|
| Small | 3 | 9V1A Adapter | ISD 2 + old 0 -> available 1 | Door Lock Project | ISD Lab 2 + old project 0 = 2, but available is 1 (-1). The remark "Door Lock Project" may explain the difference. |
| Small | 8 | Arduino Mega Ch340 | ISD 2 + old 1 -> available 2 | 1 ongoing project | ISD Lab 2 + old project 1 = 3, but available is 2 (-1). The remark "1 ongoing project" may explain the difference. |
| Small | 25 | ECG Electrode | ISD 0 + old 2 -> available 1 | 1 ongoing Project | ISD Lab 0 + old project 2 = 2, but available is 1 (-1). The remark "1 ongoing Project" may explain the difference. |
| Small | 30 | Gluegun-60W | ISD 2 + old 0 -> available 1 | Damaged | ISD Lab 2 + old project 0 = 2, but available is 1 (-1). The remark "Damaged" may explain the difference. |
| Small | 35 | L298N Driver | ISD 8 + old 4 -> available 13 |  | ISD Lab 8 + old project 4 = 12, but available is 13 (+1). More available than recorded - cannot be explained by the remarks. |
| Small | 46 | Multimeter | ISD 2 + old 0 -> available 1 | Damaged | ISD Lab 2 + old project 0 = 2, but available is 1 (-1). The remark "Damaged" may explain the difference. |
| Small | 60 | RFID Scanner | ISD 1 + old 4 -> available 4 |  | ISD Lab 1 + old project 4 = 5, but available is 4 (-1). |
| Small | 66 | Soldering ﬂux | ISD 2 + old 0 -> available 1 |  | ISD Lab 2 + old project 0 = 2, but available is 1 (-1). |
| Small | 67 | Soldering Stand | ISD 2 + old 0 -> available 1 | Damaged | ISD Lab 2 + old project 0 = 2, but available is 1 (-1). The remark "Damaged" may explain the difference. |
| Small | 68 | Soldron Iron 25w | ISD 2 + old 0 -> available 1 |  | ISD Lab 2 + old project 0 = 2, but available is 1 (-1). |
| Small | 76 | Transparent Glue Stick | ISD 5 + old 0 -> available 1 | Used for Project | ISD Lab 5 + old project 0 = 5, but available is 1 (-4). The remark "Used for Project" may explain the difference. |

## Damaged stock (4)

Damaged units are proposed as "damaged" stock (kept in the total, never requestable).

| Section | No. | Item (as written) | Quantities | Remarks | Note |
|---|---|---|---|---|---|
| Small | 30 | Gluegun-60W | ISD 2 + old 0 -> available 1 | Damaged | ISD Lab 2 + old project 0 = 2, but available is 1 (-1). The remark "Damaged" may explain the difference. Remark says "Damaged". Tool/consumable: proposed as lab-use only (not borrowable) until the lab decides. |
| Small | 40 | LM2596 BUCK | ISD 0 + old 0 -> available 0 | 1 Damaged | Remark says "1 Damaged". Nothing reported available. |
| Small | 46 | Multimeter | ISD 2 + old 0 -> available 1 | Damaged | ISD Lab 2 + old project 0 = 2, but available is 1 (-1). The remark "Damaged" may explain the difference. Remark says "Damaged". Tool/consumable: proposed as lab-use only (not borrowable) until the lab decides. |
| Small | 67 | Soldering Stand | ISD 2 + old 0 -> available 1 | Damaged | ISD Lab 2 + old project 0 = 2, but available is 1 (-1). The remark "Damaged" may explain the difference. Remark says "Damaged". Tool/consumable: proposed as lab-use only (not borrowable) until the lab decides. |

## Allocated to projects (10)

The app has no "allocated" stock bucket. These units are proposed as NOT available; record a real request/loan if a project is holding them.

| Section | No. | Item (as written) | Quantities | Remarks | Note |
|---|---|---|---|---|---|
| Small | 3 | 9V1A Adapter | ISD 2 + old 0 -> available 1 | Door Lock Project | ISD Lab 2 + old project 0 = 2, but available is 1 (-1). The remark "Door Lock Project" may explain the difference. Remark says "Door Lock Project" - units may be committed to a project. |
| Small | 6 | Alphanumeric LCD | ISD 1 + old 12 -> available 13 | Used for Project | Remark says "Used for Project" - units may be committed to a project. |
| Small | 7 | Arduino Connector Cable | ISD 5 + old 10 -> available 15 | 1 ongoing project | Remark says "1 ongoing project" - units may be committed to a project. |
| Small | 8 | Arduino Mega Ch340 | ISD 2 + old 1 -> available 2 | 1 ongoing project | ISD Lab 2 + old project 1 = 3, but available is 2 (-1). The remark "1 ongoing project" may explain the difference. Remark says "1 ongoing project" - units may be committed to a project. |
| Small | 12 | Bread Board | ISD 4 + old 17 -> available 21 | 1 ongoing project | Remark says "1 ongoing project" - units may be committed to a project. |
| Small | 25 | ECG Electrode | ISD 0 + old 2 -> available 1 | 1 ongoing Project | ISD Lab 0 + old project 2 = 2, but available is 1 (-1). The remark "1 ongoing Project" may explain the difference. Remark says "1 ongoing Project" - units may be committed to a project. |
| Small | 33 | IR sensor | ISD 3 + old 14 -> available 17 | 2 meccanum bot | Remark says "2 meccanum bot" - units may be committed to a project. |
| Small | 34 | L293D Motor Driver | ISD 0 + old 0 -> available 0 | 3 meccanum bot | Remark says "3 meccanum bot" - units may be committed to a project. Nothing reported available. |
| Small | 62 | SG90 Servo Motor | ISD 4 + old 13 -> available 17 | 1 maccnum bot | Remark says "1 maccnum bot" - units may be committed to a project. |
| Small | 76 | Transparent Glue Stick | ISD 5 + old 0 -> available 1 | Used for Project | ISD Lab 5 + old project 0 = 5, but available is 1 (-4). The remark "Used for Project" may explain the difference. Remark says "Used for Project" - units may be committed to a project. Tool/consumable: proposed as lab-use only (not borrowable) until the lab decides. |

## Duplicate serial numbers (4)

Both rows are imported; they are distinct items.

| Section | No. | Item (as written) | Quantities | Remarks | Note |
|---|---|---|---|---|---|
| Small | 51 | Node mcu ch 340 base | ISD 1 + old 1 -> available 2 |  | Serial number 51 is used for more than one row in this section. |
| Small | 51 | Octocouplers (4NES) (WHITE) | ISD 2 + old 0 -> available 2 |  | Serial number 51 is used for more than one row in this section. Probably optocouplers (e.g. 4N35); part number unclear. |
| Small | 58 | Pushbutton | ISD 14 + old 9 -> available 23 |  | Serial number 58 is used for more than one row in this section. |
| Small | 58 | Rain Sensor | ISD 1 + old 0 -> available 1 |  | Serial number 58 is used for more than one row in this section. |

## Unclear names or model numbers (29)

Names are kept exactly as written (formatting only cleaned). Confirm or correct them in the review screen.

| Section | No. | Item (as written) | Quantities | Remarks | Note |
|---|---|---|---|---|---|
| Special | 8 | Tiny HP Pro | qty 1, available 1 |  | Probably an HP mini PC; model not stated. Special equipment: proposed as not borrowable until the lab decides. |
| Special | 10 | Joy Stick | qty 1, available 1 |  | Model not stated. Special equipment: proposed as not borrowable until the lab decides. |
| Special | 11 | Arduino and Robotics Kit | qty 8, available 8 |  | Kit contents not listed. Special equipment: proposed as not borrowable until the lab decides. |
| Small | 1 | 1ch Optp Relay | ISD 1 + old 3 -> available 4 |  | Probably "1-channel opto (optocoupler) relay". |
| Small | 2 | 4ch Optp Relay | ISD 0 + old 1 -> available 1 |  | Probably "4-channel opto (optocoupler) relay". |
| Small | 13 | Cable BK 40 -002 II HC | ISD 1 + old 0 -> available 1 |  | Cable type/part number unclear. |
| Small | 15 | Cell Holder-2 18659 2 | ISD 1 + old 0 -> available 1 |  | "18659" is probably the 18650 cell size; trailing "2" unclear. |
| Small | 16 | Cell Holder-4 18659 2 | ISD 2 + old 0 -> available 2 |  | "18659" is probably the 18650 cell size; trailing "2" unclear. |
| Small | 17 | Cell Lithium Charger 2 | ISD 2 + old 0 -> available 2 |  | Trailing "2" unclear (2-cell charger?). |
| Small | 18 | CP2102-USB to -Til Serial Convertor | ISD 0 + old 1 -> available 1 |  | "Til" is probably TTL. |
| Small | 20 | DC 3231-Real Time Clock Module | ISD 0 + old 1 -> available 1 |  | Probably the DS3231 RTC module. |
| Small | 22 | Dinkle EK500 v | ISD 0 + old 4 -> available 4 |  | Probably a Dinkle EK500V terminal block. |
| Small | 37 | Lead Hilo 50 Grams | ISD 2 + old 0 -> available 2 |  | Solder lead, 50 g (consumable). Tool/consumable: proposed as lab-use only (not borrowable) until the lab decides. |
| Small | 38 | led 10 pcs -5mm bright white | ISD 35 + old 0 -> available 35 |  | Quantity 35 may count packs of 10 or single LEDs. |
| Small | 39 | LED's (Bright White,RGB,Red Green9, Yellow9, Blue) | ISD 50 + old 0 -> available 50 |  | Mixed colours in one line; "Green9, Yellow9" unclear (counts?). |
| Small | 45 | MQ -Series Gas Sensor Module | ISD 0 + old 3 -> available 3 |  | Exact MQ sensor model(s) not stated. |
| Small | 51 | Octocouplers (4NES) (WHITE) | ISD 2 + old 0 -> available 2 |  | Serial number 51 is used for more than one row in this section. Probably optocouplers (e.g. 4N35); part number unclear. |
| Small | 54 | PIEZ0  Buzzer | ISD 0 + old 2 -> available 2 |  | "PIEZ0" written with a zero. |
| Small | 57 | Port Convertor | ISD 1 + old 0 -> available 1 |  | Port type not stated. |
| Small | 59 | Resistance (13 Pkd) | ISD 131 + old 0 -> available 131 |  | "13 Pkd" unclear (13 packs?) while quantity is 131. |
| Small | 61 | I2C LCB Adapter Module | ISD 0 + old 3 -> available 3 |  | "LCB" is probably LCD (I2C LCD adapter). |
| Small | 68 | Soldron Iron 25w | ISD 2 + old 0 -> available 1 |  | Probably a 25 W soldering iron. ISD Lab 2 + old project 0 = 2, but available is 1 (-1). Tool/consumable: proposed as lab-use only (not borrowable) until the lab decides. |
| Small | 72 | Temperature Sensor (NMP36)(BLACK) | ISD 2 + old 0 -> available 2 |  | Part number "NMP36" unclear (TMP36?). |
| Small | 73 | Termister Sensor | ISD 0 + old 1 -> available 1 |  | Probably a thermistor sensor. |
| Small | 77 | Turbuity Value Sensor | ISD 1 + old 0 -> available 1 |  | Probably a turbidity sensor. |
| Small | 81 | Universal Adapter | ISD 1 + old 0 -> available 1 |  | Adapter type not stated. |
| Small | 84 | Walking Stick | ISD 2 + old 0 -> available 2 |  | Probably a project prototype (smart walking stick); confirm whether it is lendable. |
| Small | 85 | Wefaa Robatics (Screw box) | ISD 5 + old 0 -> available 5 |  | Brand spelling unclear. |
| Small | 87 | Bosch Trilling Set | ISD 1 + old 0 -> available 1 |  | Probably a Bosch drilling set. Tool/consumable: proposed as lab-use only (not borrowable) until the lab decides. |

## Nothing available (2)

Imported with 0 available so projects that need them show as short.

| Section | No. | Item (as written) | Quantities | Remarks | Note |
|---|---|---|---|---|---|
| Small | 34 | L293D Motor Driver | ISD 0 + old 0 -> available 0 | 3 meccanum bot | Remark says "3 meccanum bot" - units may be committed to a project. Nothing reported available. |
| Small | 40 | LM2596 BUCK | ISD 0 + old 0 -> available 0 | 1 Damaged | Remark says "1 Damaged". Nothing reported available. |

## Borrowing policy decisions (26)

Proposed as not borrowable by students until an admin switches "Available for borrowing" on.

| Section | No. | Item (as written) | Quantities | Remarks | Note |
|---|---|---|---|---|---|
| Special | 1 | Smorphi with AI Features | qty 5, available 5 |  | Special equipment: proposed as not borrowable until the lab decides. |
| Special | 2 | 6 DoF Mini Arm | qty 1, available 1 |  | Special equipment: proposed as not borrowable until the lab decides. |
| Special | 3 | ZED-2 Stereolabs Xavier NX Kit | qty 1, available 1 |  | Special equipment: proposed as not borrowable until the lab decides. |
| Special | 4 | 2D Lidar Sensor | qty 1, available 1 |  | Special equipment: proposed as not borrowable until the lab decides. |
| Special | 5 | Intel Depth Sense Camera | qty 1, available 1 |  | Special equipment: proposed as not borrowable until the lab decides. |
| Special | 6 | Jetson Nano | qty 1, available 1 |  | Special equipment: proposed as not borrowable until the lab decides. |
| Special | 7 | STM32F769I-Disco | qty 2, available 2 |  | Special equipment: proposed as not borrowable until the lab decides. |
| Special | 8 | Tiny HP Pro | qty 1, available 1 |  | Probably an HP mini PC; model not stated. Special equipment: proposed as not borrowable until the lab decides. |
| Special | 9 | Re-Computer Case (2071) | qty 1, available 1 |  | Special equipment: proposed as not borrowable until the lab decides. |
| Special | 10 | Joy Stick | qty 1, available 1 |  | Model not stated. Special equipment: proposed as not borrowable until the lab decides. |
| Special | 11 | Arduino and Robotics Kit | qty 8, available 8 |  | Kit contents not listed. Special equipment: proposed as not borrowable until the lab decides. |
| Special | 12 | 3d Printer | qty 1, available 1 |  | Special equipment: proposed as not borrowable until the lab decides. |
| Special | 13 | Twin Bot | qty 6, available 6 |  | Special equipment: proposed as not borrowable until the lab decides. |
| Special | 14 | C-DAC Drone Kit | qty 3, available 3 | Received 11/5/2026 | Special equipment: proposed as not borrowable until the lab decides. |
| Special | 15 | Motor test Jig | qty 1, available 1 | Received 11/5/2026 | Special equipment: proposed as not borrowable until the lab decides. |
| Small | 5 | Allen Keys | ISD 16 + old 0 -> available 16 |  | Tool/consumable: proposed as lab-use only (not borrowable) until the lab decides. |
| Small | 30 | Gluegun-60W | ISD 2 + old 0 -> available 1 | Damaged | ISD Lab 2 + old project 0 = 2, but available is 1 (-1). The remark "Damaged" may explain the difference. Remark says "Damaged". Tool/consumable: proposed as lab-use only (not borrowable) until the lab decides. |
| Small | 37 | Lead Hilo 50 Grams | ISD 2 + old 0 -> available 2 |  | Solder lead, 50 g (consumable). Tool/consumable: proposed as lab-use only (not borrowable) until the lab decides. |
| Small | 46 | Multimeter | ISD 2 + old 0 -> available 1 | Damaged | ISD Lab 2 + old project 0 = 2, but available is 1 (-1). The remark "Damaged" may explain the difference. Remark says "Damaged". Tool/consumable: proposed as lab-use only (not borrowable) until the lab decides. |
| Small | 66 | Soldering ﬂux | ISD 2 + old 0 -> available 1 |  | ISD Lab 2 + old project 0 = 2, but available is 1 (-1). Tool/consumable: proposed as lab-use only (not borrowable) until the lab decides. |
| Small | 67 | Soldering Stand | ISD 2 + old 0 -> available 1 | Damaged | ISD Lab 2 + old project 0 = 2, but available is 1 (-1). The remark "Damaged" may explain the difference. Remark says "Damaged". Tool/consumable: proposed as lab-use only (not borrowable) until the lab decides. |
| Small | 68 | Soldron Iron 25w | ISD 2 + old 0 -> available 1 |  | Probably a 25 W soldering iron. ISD Lab 2 + old project 0 = 2, but available is 1 (-1). Tool/consumable: proposed as lab-use only (not borrowable) until the lab decides. |
| Small | 71 | Stripper | ISD 2 + old 0 -> available 2 |  | Tool/consumable: proposed as lab-use only (not borrowable) until the lab decides. |
| Small | 76 | Transparent Glue Stick | ISD 5 + old 0 -> available 1 | Used for Project | ISD Lab 5 + old project 0 = 5, but available is 1 (-4). The remark "Used for Project" may explain the difference. Remark says "Used for Project" - units may be committed to a project. Tool/consumable: proposed as lab-use only (not borrowable) until the lab decides. |
| Small | 86 | Weighing Machine | ISD 3 + old 0 -> available 3 |  | Tool/consumable: proposed as lab-use only (not borrowable) until the lab decides. |
| Small | 87 | Bosch Trilling Set | ISD 1 + old 0 -> available 1 |  | Probably a Bosch drilling set. Tool/consumable: proposed as lab-use only (not borrowable) until the lab decides. |
