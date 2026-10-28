# Setup and deployment

Allow about 20 minutes. You need a free Supabase account, a Vercel account and Node 20.19 or
newer.

## 1. Create the Supabase project

1. Create a project at <https://supabase.com/dashboard>. Choose the Mumbai (ap-south-1) region if it is available.
2. Open **SQL Editor** and run each file in `supabase/migrations/` **in order** (0001 → 0012).
   `0011` must be run on its own and finish before `0012` (Postgres needs the new `super_admin` role committed first).
   Paste each file's contents and click Run. Every file must finish without errors before you run the next.
   - With the Supabase CLI instead: `supabase link --project-ref <ref>` then `supabase db push`.
3. Optional: run `supabase/seed.sql` to load the demonstration inventory and projects. Every row is
   marked `is_demo` and labelled "Demo data" in the UI. See [DEMO_DATA.md](DEMO_DATA.md).

## 2. Configure authentication

In **Authentication → Providers → Email**:
- Enable the email provider.
- Turn **Confirm email** on. Students must verify their address before they can sign in.
- Set the minimum password length to 8.

In **Authentication → URL Configuration**:
- **Site URL**: your production URL, e.g. `https://isd-lab.vercel.app`
- **Redirect URLs**: add
  - `https://isd-lab.vercel.app/auth/callback`
  - `https://isd-lab.vercel.app/reset-password`
  - `http://localhost:5173/auth/callback` and `http://localhost:5173/reset-password` for development
  - for Vercel preview deployments, `https://*-<your-team>.vercel.app/**`

**Email delivery.** Supabase's built-in mailer is heavily rate limited and meant for testing only.
Before real students sign up, add an SMTP provider under **Authentication → Emails → SMTP Settings**
(for example the SRM mail server or any transactional email service).

**Allowed email domains.** By default only `@srmist.edu.in` addresses can register. This rule is
enforced by a database trigger on `auth.users`, so it cannot be bypassed from the browser.
Administrators can change the list later under **Admin → Settings**. An empty list allows any domain.

## 3. Create the first Super Admin

Everyone who registers becomes a **student**. Nothing a user sends at sign-up can change that,
and a verified SRM email does **not** make anyone an administrator.

There are two staff roles (migration `0012`):

| Role | Can |
| --- | --- |
| **Super Admin** | Approve or reject borrow requests and component take-away requests, change roles, and everything an Admin can do. Gets a notification whenever an Admin finishes verifying a return. |
| **Admin** | Issue approved requests, verify returns, loan extensions, inventory, projects, enquiries, reports, restrict or suspend students. Cannot see pending requests at all, cannot approve or reject, cannot change roles. |

When `0012` runs, every existing active `admin` becomes a `super_admin`, so nobody loses access.
A Super Admin then switches operational staff to **Admin** under **Admin → Users**.

To appoint the first Super Admin on a new project:
1. The staff member registers normally through the app and verifies their email.
2. A Supabase project owner runs this once in the SQL Editor (it runs with owner rights, which
   browser users never have):

```sql
update public.profiles
   set role = 'super_admin', status = 'active'
 where email = 'lab.staff.member@srmist.edu.in';   -- the staff member's address

-- check
select email, role, status from public.profiles where role in ('admin', 'super_admin');
```

After that, Super Admins appoint Admins and other Super Admins from **Admin → Users**.
Every change is written to the activity log. Nobody can change their own role or status, and the
last active Super Admin cannot be demoted, so the console always keeps a Super Admin.

## 4. Storage

Migration `0005` creates a public `lab-images` bucket (2 MB limit; JPG, PNG and WebP only). Only
administrators can upload, replace or delete files. Check it appears under **Storage**.
If your project already had a bucket with that name, review its settings.

## 5. Realtime

Migration `0005` adds the inventory, project, request, borrowing, return and notification tables
to the `supabase_realtime` publication. Readiness percentages, queues and notifications then
update in open browsers within about a second. Realtime still applies each user's RLS policies.

## 6. Run locally

```bash
npm install
cp .env.example .env.local
# .env.local:
# VITE_SUPABASE_URL=https://<ref>.supabase.co
# VITE_SUPABASE_ANON_KEY=<anon public key from Project Settings → API>
npm run dev
```

Only the **anon / publishable** key goes in the frontend. **Never** put the `service_role` key in
any `VITE_` variable, in Vercel environment variables for this project, or in the repository.

## 7. Deploy to Vercel

1. Push the repository to GitHub.
2. In Vercel: **Add New → Project**, import the repository. The framework preset is Vite;
   `vercel.json` already sets the build command, the output folder and the SPA rewrite.
3. Add the environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for
   Production and Preview.
4. Deploy. Then put the production URL into Supabase's Site URL and Redirect URLs (step 2).

## 8. First-run checklist

- [ ] Register with an SRM address, receive the email, verify it and sign in. You land on the student dashboard.
- [ ] Try registering with a non-SRM address. It is refused.
- [ ] Promote the staff account (step 3), sign out and in again. "Admin console" appears.
- [ ] Add a real item, request it as a student, then approve, issue and verify the return as admin.
      Watch the quantities on Admin → Inventory at each step.
