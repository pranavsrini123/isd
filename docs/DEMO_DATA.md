# Demo data and loading the real inventory

`supabase/seed.sql` loads **fictional** demonstration data: 7 categories, 24 components and
9 projects (8 published, 1 draft). Every row has `is_demo = true` and shows a "Demo data" badge.
The seed contains **no people**: no students, no requests and no loans.

Two items are deliberately short (units marked damaged) so that readiness below 100% is visible:
- L298N Motor Driver: 0 available, so Obstacle Avoiding Robot, Line Follower and Bluetooth Car are not buildable
- NRF24L01 Radio Module: 1 available, so Gesture Controlled Arm is not buildable

## Replacing it with the lab's real stock

Recommended: enter real items through **Admin → Inventory → Add item** (initial quantity goes to
"available"), create real projects in **Admin → Projects**, then remove the demo rows.

To remove the demo rows (run in the SQL Editor **before** demo items have been used in real
requests; otherwise archive them from the UI instead):

```sql
begin;
delete from public.projects where is_demo;                -- removes their component lists too
delete from public.inventory_items i
 where i.is_demo
   and not exists (select 1 from public.request_items r where r.item_id = i.id)
   and not exists (select 1 from public.project_components c where c.item_id = i.id);
delete from public.inventory_categories c
 where not exists (select 1 from public.inventory_items i where i.category_id = c.id);
commit;
```

### Bulk import from a spreadsheet

Use a CSV with columns `name, category, brand_model, storage_location, total_qty,
low_stock_threshold`. Import it into a temporary table (Table Editor → Import CSV), then run:

```sql
insert into public.inventory_categories (name)
select distinct category from import_items
on conflict (name) do nothing;

insert into public.inventory_items
  (name, category_id, brand_model, storage_location, total_qty, available_qty, low_stock_threshold)
select t.name, c.id, t.brand_model, t.storage_location, t.total_qty, t.total_qty, coalesce(t.low_stock_threshold, 2)
from import_items t join public.inventory_categories c on c.name = t.category;

drop table import_items;
```

This runs as the project owner, so all stock starts as available. From then on, use
**Adjust stock** in the admin console so every change is audited.
