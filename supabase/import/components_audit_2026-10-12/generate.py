#!/usr/bin/env python3
"""
Builds the auditable import dataset for "COMPONENTS Audit.docx" (ISD Lab, TP1-1509,
availability as of 12/10/2026) and the idempotent SQL data migration.

Input : source_tables.json  - the four Word tables, cell text exactly as extracted
Output: dataset.csv          - one row per source entry, every source field kept
        DISCREPANCIES.md     - what needs an administrator's decision, and why
        ../../migrations/0008_components_audit_2026_10_12_data.sql

Nothing here edits stock. Every row becomes a *source record* that an admin
reviews and applies in the app (Admin -> Inventory import), which writes stock
through the audited adjust_inventory() workflow.

Run: python3 generate.py
"""
import csv
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
BATCH = 'components-audit-2026-10-12'
DOC = 'COMPONENTS Audit.docx'
AS_OF = '2026-10-12'          # "Available as of 12/10/2026" (DD/MM/YYYY)
TABLE_PAGE = {0: 1, 1: 2, 2: 3, 3: 4}

tables = json.loads((HERE / 'source_tables.json').read_text())

# ---------------------------------------------------------------- categories
# Keyword rules, first match wins. Category is a suggestion; admins can change it.
CATEGORY_RULES = [
    ('Tools', r'allen key|glue ?gun|lead hilo|multimeter|solder|soldron|stripper|weighing machine|trilling|drilling|glue stick'),
    ('Microcontrollers', r'arduino (mega|nano|uno)|esp ?8266|esp32|mkr ?1000|node ?mcu'),
    ('Motors & Drivers', r'motor driver|l298n|l293d|servo|dc motor|vibration motor|diy [24]w drive'),
    ('Communication', r'hc05|bluetooth|gps|gsm|sim ?800'),
    ('Sensors', r'sensor|\bldr\b|mpu ?6050|pir|rfid|finger ?print|heart rate|ecg|ultra ?sonic sensor|termister|phototransistor'),
    ('Displays & Output', r'lcd(?! ?adapter)|alphanumeric|led|speaker|piezo|piez0|buzzer'),
    ('Modules & Interfaces', r'relay|cp2102|serial|real time clock|3231|i2c|port convertor|usb hub'),
    ('Power', r'adapter|smps|battery|cell holder|lithium charger|buck|power supply'),
    ('Passive Components', r'capacitor|diode|mosfet|octocoupler|optocoupler|potentio|resistance|pushbutton'),
    ('Prototyping & Accessories', r'bread ?board|cable|dinkle|holder|screw box|walking stick'),
]
# Tools and consumables are proposed as lab-use only (not borrowable) until an admin decides.
LAB_USE_ONLY = {'Tools'}

def category_for(name, section):
    if section == 'special_equipment':
        return 'Special Equipment'
    n = name.lower()
    for cat, rx in CATEGORY_RULES:
        if re.search(rx, n):
            return cat
    return 'Miscellaneous'

# ---------------------------------------------------------------- names
# Only formatting is cleaned (spacing, a typographic ligature). Spelling, model
# numbers and units are kept exactly; likely typos are flagged instead.
def display_name(raw):
    s = raw.replace('ﬂ', 'fl').replace('ﬁ', 'fi')
    s = re.sub(r'\s+', ' ', s).strip()
    s = re.sub(r'\s*-\s*$', '', s)
    return s

UNCLEAR_NAMES = {
    '1ch Optp Relay': 'Probably "1-channel opto (optocoupler) relay".',
    '4ch Optp Relay': 'Probably "4-channel opto (optocoupler) relay".',
    'Cable BK 40 -002 II HC': 'Cable type/part number unclear.',
    'Cell Holder-2 18659 2': '"18659" is probably the 18650 cell size; trailing "2" unclear.',
    'Cell Holder-4 18659 2': '"18659" is probably the 18650 cell size; trailing "2" unclear.',
    'Cell Lithium Charger 2': 'Trailing "2" unclear (2-cell charger?).',
    'CP2102-USB to -Til Serial Convertor': '"Til" is probably TTL.',
    'DC 3231-Real Time Clock Module': 'Probably the DS3231 RTC module.',
    'Dinkle EK500 v': 'Probably a Dinkle EK500V terminal block.',
    "LED's (Bright White,RGB,Red Green9, Yellow9, Blue)": 'Mixed colours in one line; "Green9, Yellow9" unclear (counts?).',
    'led 10 pcs -5mm bright white': 'Quantity 35 may count packs of 10 or single LEDs.',
    'Resistance (13 Pkd)': '"13 Pkd" unclear (13 packs?) while quantity is 131.',
    'Octocouplers (4NES) (WHITE)': 'Probably optocouplers (e.g. 4N35); part number unclear.',
    'I2C LCB Adapter Module': '"LCB" is probably LCD (I2C LCD adapter).',
    'PIEZ0  Buzzer': '"PIEZ0" written with a zero.',
    'Temperature Sensor (NMP36)(BLACK)': 'Part number "NMP36" unclear (TMP36?).',
    'Termister Sensor': 'Probably a thermistor sensor.',
    'Turbuity Value Sensor': 'Probably a turbidity sensor.',
    'Soldron Iron 25w': 'Probably a 25 W soldering iron.',
    'Wefaa Robatics (Screw box)': 'Brand spelling unclear.',
    'Bosch Trilling Set': 'Probably a Bosch drilling set.',
    'Lead Hilo 50 Grams': 'Solder lead, 50 g (consumable).',
    'MQ -Series Gas Sensor Module': 'Exact MQ sensor model(s) not stated.',
    'Port Convertor': 'Port type not stated.',
    'Universal Adapter': 'Adapter type not stated.',
    'Walking Stick': 'Probably a project prototype (smart walking stick); confirm whether it is lendable.',
    'Arduino and Robotics Kit': 'Kit contents not listed.',
    'Joy Stick': 'Model not stated.',
    'Tiny HP Pro': 'Probably an HP mini PC; model not stated.',
}

DAMAGE_RX = re.compile(r'(\d+)?\s*damaged', re.I)
ALLOC_RX = re.compile(r'project|bot', re.I)

def to_int(s):
    s = (s or '').strip()
    return int(s) if re.fullmatch(r'\d+', s) else None

# ---------------------------------------------------------------- rows
rows = []
serial_seen = {}
for ti, table in enumerate(tables):
    section = 'special_equipment' if ti == 0 else 'small_components'
    body = table[1:] if ti == 0 else table[2:]
    for cells in body:
        serial = cells[0].strip()
        name = cells[1]
        rec = {
            'batch_key': BATCH, 'source_doc': DOC, 'source_section': section,
            'source_page': TABLE_PAGE[ti], 'source_serial': serial, 'original_name': name,
            'display_name': display_name(name), 'category': category_for(name, section),
            'qty_reported': None, 'qty_isd_lab': None, 'qty_old_project': None,
            'qty_available_reported': None, 'remarks': cells[-1].strip() or None,
            'received_date': None, 'flags': [], 'notes': [],
        }
        if section == 'special_equipment':
            rec['qty_reported'] = to_int(cells[2])
            rec['qty_available_reported'] = to_int(cells[3])
            m = re.search(r'Received\s+(\d{1,2})/(\d{1,2})/(\d{4})', rec['remarks'] or '')
            if m:  # DD/MM/YYYY, as in the rest of the document
                rec['received_date'] = f'{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}'
        else:
            rec['qty_isd_lab'] = to_int(cells[2])
            rec['qty_old_project'] = to_int(cells[3])
            rec['qty_available_reported'] = to_int(cells[4])
        key = (section, serial)
        serial_seen[key] = serial_seen.get(key, 0) + 1
        rows.append(rec)

for section in ('special_equipment', 'small_components'):
    sec = [r for r in rows if r['source_section'] == section]
    for i, r in enumerate(sec, 1):
        r['source_row'] = i

# ---------------------------------------------------------------- checks
def add(r, flag, note):
    if flag not in r['flags']:
        r['flags'].append(flag)
    if note:
        r['notes'].append(note)

small_serials = [int(r['source_serial']) for r in rows if r['source_section'] == 'small_components']
missing_serials = sorted(set(range(1, max(small_serials) + 1)) - set(small_serials))

for r in rows:
    rem = r['remarks'] or ''
    if serial_seen[(r['source_section'], r['source_serial'])] > 1:
        add(r, 'duplicate_serial', f'Serial number {r["source_serial"]} is used for more than one row in this section.')
    if r['original_name'] in UNCLEAR_NAMES:
        add(r, 'unclear_name', UNCLEAR_NAMES[r['original_name']])
    avail = r['qty_available_reported']
    if r['source_section'] == 'special_equipment':
        expected = r['qty_reported']
        if expected != avail:
            add(r, 'quantity_mismatch', f'Quantity {expected} but available {avail}.')
        add(r, 'borrowing_policy', 'Special equipment: proposed as not borrowable until the lab decides.')
    else:
        expected = (r['qty_isd_lab'] or 0) + (r['qty_old_project'] or 0)
        if expected != avail:
            diff = expected - avail
            note = f'ISD Lab {r["qty_isd_lab"]} + old project {r["qty_old_project"]} = {expected}, but available is {avail} ({"-" if diff > 0 else "+"}{abs(diff)}).'
            m = re.search(r'(\d+)', rem)
            if diff > 0 and rem and (m is None or int(m.group(1)) == diff):
                note += f' The remark "{rem}" may explain the difference.'
            elif diff < 0:
                note += ' More available than recorded - cannot be explained by the remarks.'
            add(r, 'quantity_mismatch', note)
    dm = DAMAGE_RX.search(rem)
    if dm:
        add(r, 'damaged', f'Remark says "{rem}".')
    if ALLOC_RX.search(rem) and not dm:
        add(r, 'allocated', f'Remark says "{rem}" - units may be committed to a project.')
    if r['category'] in LAB_USE_ONLY:
        add(r, 'borrowing_policy', 'Tool/consumable: proposed as lab-use only (not borrowable) until the lab decides.')
    if avail == 0:
        add(r, 'zero_available', 'Nothing reported available.')

    # Proposal (never applied automatically for rows needing review).
    damaged = 0
    if dm:
        if dm.group(1):
            damaged = int(dm.group(1))
        elif r['source_section'] == 'small_components':
            damaged = max(0, (r['qty_isd_lab'] or 0) + (r['qty_old_project'] or 0) - (avail or 0))
    r['proposed_available'] = avail or 0
    r['proposed_damaged'] = damaged
    r['proposed_requestable'] = r['source_section'] != 'special_equipment' and r['category'] not in LAB_USE_ONLY
    blocking = {'quantity_mismatch', 'damaged', 'allocated', 'duplicate_serial', 'unclear_name', 'borrowing_policy', 'zero_available'}
    r['status'] = 'needs_review' if blocking & set(r['flags']) else 'ready'

# ---------------------------------------------------------------- outputs
cols = ['batch_key', 'source_doc', 'source_section', 'source_page', 'source_row', 'source_serial', 'original_name',
        'display_name', 'category', 'qty_reported', 'qty_isd_lab', 'qty_old_project', 'qty_available_reported',
        'remarks', 'received_date', 'flags', 'notes', 'proposed_available', 'proposed_damaged',
        'proposed_requestable', 'status']
with open(HERE / 'dataset.csv', 'w', newline='', encoding='utf-8') as f:
    w = csv.writer(f)
    w.writerow(cols)
    for r in rows:
        w.writerow(['; '.join(r[c]) if isinstance(r[c], list) else ('' if r[c] is None else r[c]) for c in cols])

def q(v):
    if v is None:
        return 'null'
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, int):
        return str(v)
    if isinstance(v, list):
        return "array[" + ', '.join(q(x) for x in v) + "]::text[]" if v else "'{}'::text[]"
    return "'" + str(v).replace("'", "''") + "'"

sql_cols = ['batch_key', 'source_doc', 'source_section', 'source_page', 'source_row', 'source_serial', 'original_name',
            'display_name', 'category_name', 'qty_reported', 'qty_isd_lab', 'qty_old_project', 'qty_available_reported',
            'remarks', 'received_date', 'flags', 'review_notes', 'proposed_available', 'proposed_damaged',
            'proposed_requestable', 'status']
lines = []
for r in rows:
    vals = [r['batch_key'], r['source_doc'], r['source_section'], r['source_page'], r['source_row'], r['source_serial'],
            r['original_name'], r['display_name'], r['category'], r['qty_reported'], r['qty_isd_lab'], r['qty_old_project'],
            r['qty_available_reported'], r['remarks'], r['received_date'], r['flags'], ' '.join(r['notes']) or None,
            r['proposed_available'], r['proposed_damaged'], r['proposed_requestable'], r['status']]
    v = ', '.join(q(x) for x in vals)
    v = v.replace(q(r['received_date']), q(r['received_date']) + '::date', 1) if r['received_date'] else v
    lines.append(f'  ({v})')

n_special = sum(1 for r in rows if r['source_section'] == 'special_equipment')
n_small = len(rows) - n_special
sql = f"""-- =============================================================================
-- 0008: source records from "{DOC}" (ISD Lab TP1-1509, available as of 12/10/2026)
-- GENERATED by supabase/import/components_audit_2026-10-12/generate.py - do not edit by hand.
--
-- Loads {n_special} special-equipment rows and {n_small} small-component rows into
-- inventory_source_records for review. It does NOT change any stock: an admin
-- applies each record in the app (Admin -> Inventory import), which writes stock
-- through the audited adjust_inventory() workflow.
--
-- Idempotent: rows are keyed on (batch_key, source_section, source_row), so
-- running this file again inserts nothing new and never touches reviewed rows.
-- =============================================================================
insert into public.inventory_source_records ({', '.join(sql_cols)})
values
{(',' + chr(10)).join(lines)}
on conflict (batch_key, source_section, source_row) do nothing;
"""
(HERE.parent.parent / 'migrations' / '0008_components_audit_2026_10_12_data.sql').write_text(sql, encoding='utf-8')

# ---------------------------------------------------------------- report
def fmt_qty(r):
    if r['source_section'] == 'special_equipment':
        return f'qty {r["qty_reported"]}, available {r["qty_available_reported"]}'
    return f'ISD {r["qty_isd_lab"]} + old {r["qty_old_project"]} -> available {r["qty_available_reported"]}'

def table_for(flag, title, intro):
    sel = [r for r in rows if flag in r['flags']]
    out = [f'## {title} ({len(sel)})', '', intro, '', '| Section | No. | Item (as written) | Quantities | Remarks | Note |', '|---|---|---|---|---|---|']
    for r in sel:
        sec = 'Special' if r['source_section'] == 'special_equipment' else 'Small'
        note = ' '.join(n for n in r['notes'] if (flag != 'quantity_mismatch' or 'available' in n) and n)
        out.append(f'| {sec} | {r["source_serial"]} | {r["original_name"]} | {fmt_qty(r)} | {r["remarks"] or ""} | {note.replace("|", "/")} |')
    return '\n'.join(out) + '\n'

ready = sum(1 for r in rows if r['status'] == 'ready')
report = f"""# COMPONENTS Audit - import review ({AS_OF})

Source: `{DOC}`, Intelligent System Design Lab (TP1-1509), 4 pages. Page 1 = special
equipment, pages 2-4 = small components ("Available as of 12/10/2026"). The images in the
document are page-header logos only; all data is in the four tables.

| | Special equipment | Small components | Total |
|---|---|---|---|
| Source rows found | {n_special} | {n_small} | {len(rows)} |
| Ready (numbers reconcile, no remark, borrowable) | {sum(1 for r in rows if r['status']=='ready' and r['source_section']=='special_equipment')} | {sum(1 for r in rows if r['status']=='ready' and r['source_section']=='small_components')} | {ready} |
| Need an admin decision | {sum(1 for r in rows if r['status']=='needs_review' and r['source_section']=='special_equipment')} | {sum(1 for r in rows if r['status']=='needs_review' and r['source_section']=='small_components')} | {len(rows) - ready} |

**Numbering:** small components are numbered 1-87 but serial 48 is missing
({', '.join(map(str, missing_serials)) or 'none'} missing) and serials 51 and 58 are each used twice, so there are
{n_small} rows. Rows are therefore keyed by their position in the document, not by serial number.

**Nothing in this report has been corrected.** Original names, quantities and remarks are stored
unchanged in `inventory_source_records` and in `dataset.csv`. The "proposed" values are only a
starting point in the review screen: available = the source's "available" figure, damaged = the
damaged count stated or implied by a "Damaged" remark.

"""
report += table_for('quantity_mismatch', 'Quantities that do not reconcile', 'For small components the check is ISD Lab + old project = available. None of these were adjusted.')
report += '\n' + table_for('damaged', 'Damaged stock', 'Damaged units are proposed as "damaged" stock (kept in the total, never requestable).')
report += '\n' + table_for('allocated', 'Allocated to projects', 'The app has no "allocated" stock bucket. These units are proposed as NOT available; record a real request/loan if a project is holding them.')
report += '\n' + table_for('duplicate_serial', 'Duplicate serial numbers', 'Both rows are imported; they are distinct items.')
report += '\n' + table_for('unclear_name', 'Unclear names or model numbers', 'Names are kept exactly as written (formatting only cleaned). Confirm or correct them in the review screen.')
report += '\n' + table_for('zero_available', 'Nothing available', 'Imported with 0 available so projects that need them show as short.')
report += '\n' + table_for('borrowing_policy', 'Borrowing policy decisions', 'Proposed as not borrowable by students until an admin switches "Available for borrowing" on.')
(HERE / 'DISCREPANCIES.md').write_text(report, encoding='utf-8')

print(f'rows: {len(rows)} (special {n_special}, small {n_small}); ready {ready}; review {len(rows) - ready}; missing serials {missing_serials}')
