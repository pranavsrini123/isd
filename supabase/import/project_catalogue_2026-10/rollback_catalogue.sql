-- Undo load_catalogue.sql: hide the 40 catalogue projects (as drafts) and restore
-- every project to the status it had before. Nothing is deleted.
begin;
select set_config('request.jwt.claim.sub',
  (select id::text from public.profiles where role = 'admin' and status = 'active' order by created_at limit 1), true);
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('request.jwt.claim.sub', true), 'role', 'authenticated')::text, true);

-- Remember each catalogue project's status, so re-running load_catalogue.sql puts back exactly that
-- (a project an admin had unpublished or archived stays so). A second rollback keeps the first record.
insert into public.project_status_backup (batch_key, project_id, previous_status)
select 'project-catalogue-2026-10:rolled-back', p.id, p.status from public.projects p where p.catalogue_key like 'project-catalogue-2026-10:%'
on conflict do nothing;

-- Catalogue projects become drafts (hidden from students); re-running load_catalogue.sql publishes them again.
update public.projects set status = 'draft' where catalogue_key like 'project-catalogue-2026-10:%' and status <> 'draft';
update public.projects p set status = b.previous_status
  from public.project_status_backup b
 where b.batch_key = 'project-catalogue-2026-10' and b.project_id = p.id
   and (b.previous_status <> 'published'
        or exists (select 1 from public.project_components pc where pc.project_id = p.id));
delete from public.project_status_backup where batch_key = 'project-catalogue-2026-10';
commit;
select status, count(*) from public.projects group by 1;
