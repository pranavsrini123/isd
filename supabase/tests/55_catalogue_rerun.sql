-- Re-running and undoing the catalogue load (import/project_catalogue_2026-10). Run by
-- run_catalogue_tests.sh after 50_catalogue.sql: a re-run must leave admin edits alone, and
-- rollback + load must put every project back the way it was.

-- An admin unpublishes catalogue project 03 and removes one of its requirements, and publishes a
-- project of their own.
create temp table _rr as
select (select id from public.projects where catalogue_key = 'project-catalogue-2026-10:03') as p3,
       (select min(pc.item_id::text)::uuid from public.project_components pc join public.projects p on p.id = pc.project_id
         where p.catalogue_key = 'project-catalogue-2026-10:03') as dropped,
       null::uuid as own;
update public.projects set status = 'draft' where id = (select p3 from _rr);
delete from public.project_components where project_id = (select p3 from _rr) and item_id = (select dropped from _rr);
with p as (insert into public.projects (name, slug, category) values ('Admin Project', 'admin-project', 'General') returning id)
update _rr set own = (select id from p);
insert into public.project_components (project_id, item_id, qty_required) select own, dropped, 1 from _rr;
update public.projects set status = 'published' where id = (select own from _rr);

\o /dev/null
\ir ../import/project_catalogue_2026-10/load_catalogue.sql
\o
do $$
begin
  perform t.eq('catalogue re-run: an unpublished catalogue project stays unpublished',
    (select status::text from public.projects where id = (select p3 from _rr)), 'draft');
  perform t.ok('catalogue re-run: a removed requirement is not added back',
    not exists (select 1 from public.project_components where project_id = (select p3 from _rr) and item_id = (select dropped from _rr)));
  perform t.eq('catalogue re-run: a project the admin added stays published',
    (select status::text from public.projects where id = (select own from _rr)), 'published');
  perform t.eq('catalogue re-run: the other 39 stay published',
    (select count(*)::text from public.projects where catalogue_key like 'project-catalogue-2026-10:%' and status = 'published'), '39');
  perform t.eq('catalogue re-run: nothing new archived or backed up',
    (select count(*)::text from public.project_status_backup), '9');
end $$;

\o /dev/null
\ir ../import/project_catalogue_2026-10/rollback_catalogue.sql
\o
do $$
begin
  perform t.eq('catalogue rollback: every catalogue project hidden as a draft',
    (select count(*)::text from public.projects where catalogue_key like 'project-catalogue-2026-10:%' and status <> 'draft'), '0');
  perform t.eq('catalogue rollback: old projects get their previous status back',
    (select string_agg(status::text || '=' || n, ',' order by status) from
       (select status, count(*) n from public.projects where is_demo group by 1) x), 'draft=1,published=8');
  perform t.eq('catalogue rollback: a project the admin added is left alone',
    (select status::text from public.projects where id = (select own from _rr)), 'published');
  perform t.eq('catalogue rollback: each catalogue project''s status is remembered',
    (select count(*)::text from public.project_status_backup where batch_key = 'project-catalogue-2026-10:rolled-back'), '40');
end $$;

-- A second rollback must not overwrite what the first one remembered.
\o /dev/null
\ir ../import/project_catalogue_2026-10/rollback_catalogue.sql
\ir ../import/project_catalogue_2026-10/load_catalogue.sql
\o
do $$
begin
  perform t.eq('catalogue reload: every catalogue project gets its pre-rollback status (03 stays unpublished)',
    (select string_agg(status::text || '=' || n, ',' order by status) from
       (select status, count(*) n from public.projects where catalogue_key like 'project-catalogue-2026-10:%' group by 1) x),
    'draft=1,published=39');
  perform t.eq('catalogue reload: the unpublished one is project 03',
    (select status::text from public.projects where id = (select p3 from _rr)), 'draft');
  perform t.eq('catalogue reload: no requirement added back (183 minus the removed one)',
    (select count(*)::text from public.project_components pc join public.projects p on p.id = pc.project_id
      where p.catalogue_key like 'project-catalogue-2026-10:%'), '182');
  perform t.eq('catalogue reload: everything else is archived again',
    (select count(*)::text from public.projects where catalogue_key is null and status <> 'archived'), '0');
  perform t.eq('catalogue reload: their statuses are saved again (9 old projects + the admin''s)',
    (select count(*)::text from public.project_status_backup where batch_key = 'project-catalogue-2026-10'), '10');
  perform t.eq('catalogue reload: rollback record cleared',
    (select count(*)::text from public.project_status_backup where batch_key = 'project-catalogue-2026-10:rolled-back'), '0');
end $$;
