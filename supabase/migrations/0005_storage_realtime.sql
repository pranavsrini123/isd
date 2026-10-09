-- =============================================================================
-- 0005: storage bucket for component / project images, and Realtime
-- =============================================================================

-- Public-read bucket: images are not sensitive and are shown on cards. Only
-- admins may upload, replace or remove. Size and MIME type are enforced by the
-- bucket itself.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lab-images', 'lab-images', true, 2097152,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy lab_images_admin_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'lab-images' and public.is_admin());
create policy lab_images_admin_update on storage.objects
  for update to authenticated using (bucket_id = 'lab-images' and public.is_admin())
  with check (bucket_id = 'lab-images' and public.is_admin());
create policy lab_images_admin_delete on storage.objects
  for delete to authenticated using (bucket_id = 'lab-images' and public.is_admin());

-- Realtime: the UI subscribes to these tables and refetches readiness / queues
-- when stock or request state changes. Realtime still applies each user's RLS,
-- so a student only receives events for rows they could select anyway.
alter publication supabase_realtime add table
  public.inventory_items, public.project_components, public.projects,
  public.borrow_requests, public.borrowings, public.return_records,
  public.notifications;
