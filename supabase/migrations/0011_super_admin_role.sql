-- =============================================================================
-- 0011: add the super_admin role
--
-- Postgres only lets a new enum value be used after the statement that adds it
-- has committed, so this runs on its own, before 0012 (which uses the value).
-- Run this file first, then 0012.
--
-- No data changes. Safe to run on a database with 0001-0010 applied.
-- =============================================================================

alter type public.user_role add value if not exists 'super_admin';
