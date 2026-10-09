-- Test helpers (test database only). Run as the superuser; each helper switches
-- to the 'authenticated' role with a given JWT subject, like PostgREST does.
create schema if not exists t;
create table if not exists t.results (n serial primary key, name text, passed boolean, detail text);

create or replace function t.ok(p_name text, p_cond boolean, p_detail text default null) returns void
language plpgsql as $$
begin
  insert into t.results(name, passed, detail) values (p_name, coalesce(p_cond,false), p_detail);
end $$;

-- Run a statement that returns one scalar (as text) as the given user (null = anon).
create or replace function t.as_run(p_uid uuid, p_sql text) returns text
language plpgsql as $$
declare r text;
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
  if p_uid is null then execute 'set local role anon'; else execute 'set local role authenticated'; end if;
  begin
    execute p_sql into r;
  exception when others then
    execute 'reset role'; perform set_config('request.jwt.claim.sub', '', true); raise;
  end;
  execute 'reset role'; perform set_config('request.jwt.claim.sub', '', true);
  return r;
end $$;

-- Assert the statement fails (optionally with a message pattern).
create or replace function t.throws(p_name text, p_uid uuid, p_sql text, p_pattern text default '%') returns void
language plpgsql as $$
declare msg text;
begin
  begin
    perform t.as_run(p_uid, p_sql);
    perform t.ok(p_name, false, 'expected an error but statement succeeded');
  exception when others then
    get stacked diagnostics msg = message_text;
    perform t.ok(p_name, msg ilike p_pattern, 'error was: ' || msg);
  end;
end $$;

create or replace function t.succeeds(p_name text, p_uid uuid, p_sql text) returns void
language plpgsql as $$
declare msg text;
begin
  begin
    perform t.as_run(p_uid, p_sql);
    perform t.ok(p_name, true);
  exception when others then
    get stacked diagnostics msg = message_text;
    perform t.ok(p_name, false, 'unexpected error: ' || msg);
  end;
end $$;

create or replace function t.eq(p_name text, p_actual text, p_expected text) returns void
language plpgsql as $$
begin
  perform t.ok(p_name, p_actual is not distinct from p_expected, format('expected %s, got %s', p_expected, p_actual));
end $$;

create or replace function t.mkuser(p_email text, p_name text) returns uuid
language plpgsql as $$
declare u uuid := gen_random_uuid();
begin
  insert into auth.users(id, email, raw_user_meta_data, email_confirmed_at)
  values (u, p_email, jsonb_build_object('full_name', p_name), now());
  return u;
end $$;

-- Stock snapshot helpers
create or replace function t.stock(p_item uuid, p_col text) returns text
language plpgsql as $$
declare r text;
begin
  execute format('select %I::text from public.inventory_items where id=$1', p_col) into r using p_item;
  return r;
end $$;
