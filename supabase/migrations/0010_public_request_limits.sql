-- =============================================================================
-- 0010: expose the per-request component limit to the request form
--
-- The request form checked "at most N components" against a hard-coded 20, so
-- after an admin changed max_items_per_request the form and the database could
-- disagree. get_public_settings() now returns the setting; the database check in
-- create_borrow_request() is unchanged and remains the authority.
--
-- No data changes. Safe to run on a database with 0001-0009 applied.
-- =============================================================================

create or replace function public.get_public_settings()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'allowed_email_domains',
      coalesce((select value from public.app_settings where key = 'allowed_email_domains'), '[]'::jsonb),
    'max_loan_days', public._setting_int('max_loan_days', 14),
    'max_items_per_request', public._setting_int('max_items_per_request', 20)
  );
$$;
