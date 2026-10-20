# ISD Lab project catalogue (October 2026): 40 projects

| File | What it is |
|---|---|
| `catalogue.py` | The 40 projects: content, difficulty, hours, components (as audit rows), external parts, verification notes. **Edit this.** |
| `generate.py` | Builds `load_catalogue.sql`, `rollback_catalogue.sql`, `catalogue.json`, `COMPONENT_REPORT.md`. |
| `art.py`, `scenes.py`, `render.py` | Draw the 40 project illustrations into `public/projects/<slug>.svg`. |
| `COMPONENT_REPORT.md` | Per-project components, stock at the audit, items the lab does not stock, checks needed. |

## Putting it live (Supabase SQL editor, in this order)

1. `supabase/migrations/0009_project_catalogue.sql` (schema; changes no data).
2. Deploy the app (the illustrations ship in `public/projects/`).
3. `load_catalogue.sql`. The check at the end should show `new catalogue | published | 40`;
   every older project should be `archived`.

The load uses the inventory items created from the COMPONENTS Audit (found through
`inventory_source_records`), so it creates no inventory items and changes no stock.
Re-running it adds nothing and leaves later edits made in Admin → Projects alone.

## Undo

`rollback_catalogue.sql` sets the 40 projects to draft and gives every older project back the
status it had before. Running `load_catalogue.sql` again republishes the catalogue. Nothing is deleted.

## Availability status (computed live)

| Status | Meaning |
|---|---|
| Available to build | every listed component is in stock now (damaged and reserved units excluded) |
| Requires external components | all listed components are in stock, but something the lab doesn't stock is needed (filament, pump, SIM card…) |
| Partially available | some components are short |
| Temporarily unavailable | none of the listed components is in stock |
| Requires compatibility verification | staff must confirm compatibility first; clear the note in Admin → Projects once checked |

Lab-use-only equipment (Smorphi, Jetson Nano, LiDAR, 3D printer…) counts toward availability because
those projects are built in the lab, but students still cannot borrow it.

## Images

Licensed photo libraries could not be reached from the build environment, so each project has a
project-specific illustration of its actual hardware. Replace any of them with a real photo in
Admin → Projects → (project) → Upload image.
