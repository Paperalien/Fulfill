# Production Deployment — fulfill.paperalien.com

The Fulfill app runs as a single Fly.io app (`fulfill-paperalien`, region `lax`) that serves
both the Express API (`/api/*`) and the React SPA (served at the **root**, `/`). It is reached
at its own subdomain, **`fulfill.paperalien.com`**, which points directly at Fly — **no
Cloudflare, no reverse proxy**. The brand homepage at `paperalien.com` stays on GoDaddy Website
Builder and is untouched; it just links out to the app.

> **Multi-app brand model:** every app on the `paperalien.com` brand gets its own subdomain
> pointed at its own host/stack (`fulfill.paperalien.com`, `<next>.paperalien.com`, …). The apex
> stays a pure homepage. Nothing is centrally proxied.

This runbook is the **operator checklist** for the one-time production wiring. The code changes
that make the app serve at the root (base path `/` instead of `/fulfill`) are already in the repo
(`Dockerfile`, `artifacts/api-server/src/app.ts`, `fly.toml`).

Prerequisites: `flyctl` installed and logged in (`brew install flyctl && fly auth login`), and
admin access to the GoDaddy DNS panel, the Supabase dashboard, and the Resend dashboard.

---

## Step 1 — Set Fly secrets

Runtime config the server needs. `APP_URL` is already set non-secret in `fly.toml` `[env]`.

1. List what's already set (values are never shown, only names):
   ```bash
   fly secrets list -a fulfill-paperalien
   ```
2. Set any that are missing (skip ones already present):
   ```bash
   fly secrets set -a fulfill-paperalien \
     DATABASE_URL="postgresql://...:...@...:5432/postgres" \
     SUPABASE_URL="https://jxdhdyxivyrmkeuxisre.supabase.co" \
     SUPABASE_SERVICE_ROLE_KEY="<service-role-key>" \
     RESEND_API_KEY="<resend-prod-api-key>"
   ```
   Where to find each value:
   - **`DATABASE_URL`** — the production Postgres connection string. Recommended: reuse the existing
     **Supabase** Postgres. In the Supabase dashboard → **Project Settings → Database →
     Connection string**, choose the **Session pooler** (port `5432`) or the direct connection
     (the deploy's `drizzle-kit migrate` runs DDL, which needs a session/direct connection, not the
     transaction pooler on `6543`). Substitute your DB password where it shows `[YOUR-PASSWORD]`.
   - **`SUPABASE_URL`** — exactly `https://jxdhdyxivyrmkeuxisre.supabase.co` (Project Settings → API
     → Project URL). Used server-side to validate bearer tokens.
   - **`SUPABASE_SERVICE_ROLE_KEY`** — Project Settings → API → **service_role** secret. Starts
     with `eyJ...` (a JWT) or `sb_secret_...`. **Secret — never commit or expose to the browser.**
   - **`RESEND_API_KEY`** — Resend dashboard → API Keys → create a production key. Starts with
     `re_...`. (See Step 4 — the domain must be verified for mail to actually deliver.)
3. Setting secrets triggers a restart. Verify the names now appear:
   ```bash
   fly secrets list -a fulfill-paperalien
   ```
   If a secret is wrong, the symptom is a boot/runtime error in `fly logs` (e.g. `DATABASE_URL
   must be set`, or 401s from Supabase). Re-set and redeploy.

> **Note:** `fly.toml` sets `min_machines_running = 1` so one machine is always on — no cold-start
> latency on the first request after idle, and the in-process trash-purge scheduler runs reliably.
> Set it to `0` if you'd rather scale to zero to minimize cost (a missed/delayed purge becomes
> acceptable, and first requests after idle incur a cold boot).

## Step 2 — DNS for the `fulfill` subdomain + TLS cert

This is the **only** registrar change. The apex (homepage) records are left alone.

1. Tell Fly about the hostname so it creates a Let's Encrypt cert and prints the exact DNS
   records to add:
   ```bash
   fly certs add fulfill.paperalien.com -a fulfill-paperalien
   ```
   Fly prints a **"Recommended DNS setup"** — the record(s) to point the hostname at. In practice
   this is a pair of **A + AAAA** records with the app's IPs, e.g.:
   ```
   A     fulfill.paperalien.com → 66.241.125.206
   AAAA  fulfill.paperalien.com → 2a09:8280:1::105:eb2f:0
   ```
   (Fly may instead suggest a CNAME to `fulfill-paperalien.fly.dev` — either form works for a
   subdomain. **Add whatever Fly actually printed**; don't assume.)
2. In **GoDaddy → Domain Portfolio → paperalien.com → DNS → Manage DNS → Add New Record**, add a
   record for **each** line Fly printed. For the A + AAAA case, that's two records:
   | Type | Name | Value | TTL |
   |------|------|-------|-----|
   | `A` | `fulfill` | the IPv4 Fly printed (e.g. `66.241.125.206`) | default (1 hour) |
   | `AAAA` | `fulfill` | the IPv6 Fly printed (e.g. `2a09:8280:1::105:eb2f:0`) | default (1 hour) |

   The **Name** is just `fulfill` (GoDaddy appends `.paperalien.com`). The **Value** is the
   "target" — the IP (for A/AAAA) or hostname (for a CNAME). These coexist with the apex records
   GoDaddy's Website Builder uses — no conflict, the homepage keeps working.
3. Wait for DNS to propagate, then confirm the cert is issued:
   ```bash
   dig +short fulfill.paperalien.com          # should return the A value (e.g. 66.241.125.206)
   fly certs show fulfill.paperalien.com -a fulfill-paperalien
   ```
   Success looks like `Status = Ready` / certificate issued. If it stays pending for more than a
   few minutes, the records haven't propagated yet or a value is mistyped — re-check the GoDaddy
   record values.

> **Cert story (why this is simple):** certs are per-hostname and per-platform. GoDaddy
> auto-manages the cert for `paperalien.com` / `www`; Fly auto-issues *and auto-renews* the cert
> for `fulfill.paperalien.com`. They never interact, and nothing is shared. (No Cloudflare needed —
> Fly serves the cert directly for the subdomain, routing by TLS SNI.)

## Step 3 — Supabase Auth URL configuration

**Required, or production login breaks.** Login still uses Supabase's `signInWithOtp`, so the
redirect target must be allow-listed even though we authenticate with a typed code (see Step 3a).

1. Supabase dashboard → **Authentication → URL Configuration**.
2. **Site URL:** set to `https://fulfill.paperalien.com`.
3. **Redirect URLs:** click *Add URL* and add `https://fulfill.paperalien.com/**`. Keep
   `http://localhost:5173/**` for local dev.
4. Save.

## Step 3a — Supabase email template: deliver a CODE, not a link

**Required, or returning-user sign-in is broken/confusing.** We authenticate with a 6-digit code the
user types back into the **same tab** (`supabase.auth.verifyOtp`), not an emailed link. A link opens
the OS **default browser**, which is often *not* the browser holding the user's local (unsynced)
tasks — so the session lands in one browser and the data is stranded in another. The email must
therefore show the **code** and **not** a clickable link.

1. Supabase dashboard → **Authentication → Email Templates**.
2. Select the **Magic Link** template (this is the template `signInWithOtp` uses).
3. Edit the template **body** so it:
   - **Includes the code:** add a line such as `Your sign-in code is: {{ .Token }}`.
   - **Removes the link:** delete the anchor/line that references `{{ .ConfirmationURL }}`. If any
     `{{ .ConfirmationURL }}` reference remains, a clickable link will still appear.
4. Save. Send yourself a code from the app's "Sign in" prompt. The email should show a 6-digit code
   and **no** clickable link. If a link still appears, a `{{ .ConfirmationURL }}` reference remains.
5. *(Optional)* Authentication → **Providers → Email** → lower the **OTP expiry** from the 1-hour
   default (e.g. 600s) to tighten the brute-force window. Supabase already caps verify attempts and
   throttles sends per email.

## Step 4 — Production invite email (Resend)

Workspace **invite** emails send via Resend (separate from Supabase's login emails). The domain
must be verified or invites fail / land in spam.

1. Resend dashboard → **Domains → Add Domain → `paperalien.com`**. Resend lists the records to add.
   Resend isolates its sending under a **`send.` subdomain** plus a uniquely-named DKIM record, so
   these do **not** collide with Microsoft 365 / root-domain mail:
   - **MX** on `send.paperalien.com` → `feedback-smtp.<region>.amazonses.com` (bounce return-path)
   - **TXT (SPF)** on `send.paperalien.com` → `v=spf1 include:amazonses.com ~all`
   - **TXT (DKIM)** on `resend._domainkey.paperalien.com` → the public key Resend shows
   - **TXT (DMARC)** on `_dmarc.paperalien.com` — *optional*
2. Add each record in **GoDaddy → Manage DNS**, copying Type / Name / Value exactly as Resend shows.
   **Email-safety rules (this domain carries live M365 mail):**
   - ✅ **Only ADD** Resend's records. **Never edit or delete** existing records — the root MX, the
     root SPF TXT, the `selector1`/`selector2._domainkey` CNAMEs, and the M365 CNAMEs
     (`autodiscover`, `email`, `ftp`, `lyncdiscover`, `msoid`) all keep M365 working and must stay.
   - ✅ Resend's **SPF lives on `send.paperalien.com`, not the root** — so there is **no** root-SPF
     merge to do, and the M365 root SPF is untouched.
   - ⚠️ **DMARC is the only singleton:** a domain may have only one `_dmarc` TXT. If a `_dmarc`
     record already exists (common with M365), **keep it — do not add Resend's**. Only add a
     `_dmarc` record if none exists. (DMARC isn't required for verification; SPF + DKIM are.)
3. Back in Resend, click **Verify**. It flips to *Verified* once the records resolve (can take a
   few minutes to an hour).
4. The app sends from `Fulfill <accounts@paperalien.com>` (`artifacts/api-server/src/lib/email.ts`).
   Optional: switch the `FROM` to a dedicated `noreply@paperalien.com` / `invites@paperalien.com`.
5. Ensure `RESEND_API_KEY` is set on Fly (Step 1).

## Step 5 — Deploy (merge `claude` → `main`)

CI (`.github/workflows/fly-deploy.yml`) deploys to Fly **only on push to `main`**. The Workspaces
feature currently lives on `origin/claude` (plus the deployment changes from this work).

**Before merging — confirm the prod DB has migration history** (one-time check). The deploy's
`release_command` runs `drizzle-kit migrate`, which applies only *unapplied* committed migrations
(tracked in `drizzle.__drizzle_migrations`). In the Supabase dashboard → **SQL Editor**, run:

```sql
select * from drizzle.__drizzle_migrations order by created_at;
```

- **Rows exist (0000–0002 applied):** good — the deploy will apply only the new `0003` migration as
  an additive delta. Proceed.
- **Table/schema missing, but `public` tables exist:** the DB predates migrations (`push`-managed).
  Do the **one-time baseline reset** before deploying (see `CLAUDE.md` → Deployment Architecture):
  Supabase SQL Editor → `DROP SCHEMA public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;`
  then deploy — `migrate` rebuilds the schema cleanly from `0000`.
- **Everything empty (brand-new DB):** also fine — `migrate` applies `0000`→`0003` in order.

Then:
1. Open a PR from `claude` → `main`, review, and merge (it fast-forwards — no conflicts).
2. The merge triggers GitHub Actions: typecheck → pm-app tests → drift/schema checks →
   `flyctl deploy`. The deploy's `release_command` runs `drizzle-kit migrate` against the production
   `DATABASE_URL`, applying any unapplied committed migrations.
3. Watch it:
   ```bash
   fly logs -a fulfill-paperalien
   fly status -a fulfill-paperalien
   ```
   A failing CI check stops the deploy (nothing ships). A failing `release_command` (bad
   `DATABASE_URL`, no DB permission, or a migration error) shows in the release logs — fix and redeploy.

## Step 6 — Link the app from the homepage (GoDaddy Website Builder)

Manual, in GoDaddy's builder (can't be automated):
1. GoDaddy → Website Builder → **Edit Site**.
2. Add a **Button** (or text link), set its URL to `https://fulfill.paperalien.com`.
3. **Publish**, then click the live link to confirm.

---

## Verification (end-to-end, after deploy)

1. **App + health:** `https://fulfill.paperalien.com` loads over HTTPS with a valid cert;
   `https://fulfill.paperalien.com/api/healthz` returns `{"status":"ok"}`.
2. **Login (proves Step 3):** enter an email → receive the Supabase magic-link email → clicking it
   returns to `fulfill.paperalien.com` signed in.
3. **Workspaces flow:** using the existing harness, mint a throwaway user
   (`artifacts/api-server/scripts/e2e-mint-user.mjs`), set `E2E_SESSION`, and run
   `tests/e2e/authed-workspaces.mjs` against the prod origin (create → switch → rename → leave),
   recorded. Delete the throwaway user with `e2e-delete-user.mjs` afterward. See `tests/e2e/README.md`.
4. **Invite delivery (proves Step 4):** from a shared workspace, invite a real address → confirm
   the Resend email arrives (not spam) and the `?invite=` link accepts the invitee into the
   workspace.
