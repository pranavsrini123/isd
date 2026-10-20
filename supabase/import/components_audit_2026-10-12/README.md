# COMPONENTS Audit (12/10/2026) — import kit

| File | What it is |
|---|---|
| `source_tables.json` | The four tables of `COMPONENTS Audit.docx`, cell text exactly as extracted. |
| `generate.py` | Builds everything below from `source_tables.json`. Re-run after changing it. |
| `dataset.csv` | One row per source line (103): every source field, suggested category, flags, notes, proposed values, status. |
| `DISCREPANCIES.md` | Every row that needs a decision, grouped by issue. |
| `../../migrations/0008_components_audit_2026_10_12_data.sql` | Loads the 103 rows into `inventory_source_records`. Changes no stock. |

## Applying it to Supabase

1. SQL Editor → run `0007_inventory_audit_import.sql`, then `0008_components_audit_2026_10_12_data.sql`.
   Check: `select status, count(*) from inventory_source_records group by 1;` → 64 needs_review, 39 ready.
2. Deploy the app, sign in as an admin, open **Admin → Audit import**.
3. Work through **Needs review** (Review → link to an existing item or create a new one, confirm the
   numbers, set "Available for borrowing", Apply — or Skip with a reason).
4. **Apply reconciled** creates the 'ready' rows that do not resemble an existing item. Ready rows that
   look like an existing item stay for a person to confirm.
5. **Retire demo items** archives demo items that are idle and not linked to the audit (never deletes).
   Then fix the projects listed under "Project requirements to check".

## Safety

* Stock changes only through `adjust_inventory()`; each log entry's reason names the batch, section,
  row, serial and original name. Reserved, borrowed and lost stock are never changed.
* Re-running 0008 inserts nothing (`on conflict do nothing`) and never touches reviewed rows.
* **Rollback:** open an applied row → Revert (reason required). Stock goes back to exactly the
  before-state if nothing else changed the item since; items created by the import are archived.
  Skipped rows can be re-opened the same way. To undo the whole batch, revert the applied rows.
* Students cannot read the source records; nobody can write them except through the admin functions.
