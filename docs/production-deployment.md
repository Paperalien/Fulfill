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
     (drizzle-kit `push` runs DDL, which needs a session/direct connection, not the transaction
     pooler on `6543`). Substitute your DB password where it shows `[YOUR-PASSWORD]`.
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

1. Tell Fly about the hostname so it provisions a Let's Encrypt cert and prints the exact DNS
   records to add:
   ```bash
   fly certs add fulfill.paperalien.com -a fulfill-paperalien
   ```
   Fly will show a target — for a subdomain this is a **CNAME** to `fulfill-paperalien.fly.dev`
   (and possibly an `_acme-challenge` validation record).
2. In **GoDaddy → Domain Portfolio → paperalien.com → DNS → Manage DNS → Add New Record**:
   - **Type:** `CNAME`
   - **Name:** `fulfill`
   - **Value:** `fulfill-paperalien.fly.dev` (use whatever target `fly certs add` printed)
   - **TTL:** default (1 hour)
   - Add the `_acme-challenge` record too if Fly asked for one (Type/Name/Value exactly as shown).
   This coexists with the apex `A` records GoDaddy's Website Builder uses — no conflict, the
   homepage keeps working.
3. Wait for DNS to propagate, then confirm the cert is issued:
   ```bash
   dig +short fulfill.paperalien.com          # should resolve (CNAME → fly.dev → Fly IP)
   fly certs show fulfill.paperalien.com -a fulfill-paperalien
   ```
   Success looks like `Status = Ready` / certificate issued. If it stays pending for more than a
   few minutes, the CNAME (or the ACME record) hasn't propagated or is mistyped — re-check the
   GoDaddy record values.

> **Cert story (why this is simple):** certs are per-hostname and per-platform. GoDaddy
> auto-manages the cert for `paperalien.com` / `www`; Fly auto-issues *and auto-renews* the cert
> for `fulfill.paperalien.com`. They never interact, and nothing is shared. (No Cloudflare and no
> dedicated IP are needed — those are only required to put a bare *apex* domain on Fly, which a
> subdomain CNAME sidesteps entirely.)

## Step 3 — Supabase Auth URL configuration

**Required, or production login breaks.** Login is a Supabase magic link, and the link's redirect
target must be allow-listed.

1. Supabase dashboard → **Authentication → URL Configuration**.
2. **Site URL:** set to `https://fulfill.paperalien.com`.
3. **Redirect URLs:** click *Add URL* and add `https://fulfill.paperalien.com/**`. Keep
   `http://localhost:5173/**` for local dev.
4. Save. If this is wrong, the symptom is: the magic-link email arrives, but clicking it lands on
   an error / doesn't sign the user in.

## Step 4 — Production invite email (Resend)

Workspace **invite** emails send via Resend (separate from Supabase's login emails). The domain
must be verified or invites fail / land in spam.

1. Resend dashboard → **Domains → Add Domain → `paperalien.com`**. Resend lists the DNS records to
   add — typically a DKIM **CNAME** (e.g. `resend._domainkey`), an SPF **TXT**, and an optional
   DMARC **TXT**.
2. Add each record in **GoDaddy → Manage DNS**, copying Type / Name / Value exactly as Resend
   shows.
   - ⚠️ **SPF caution:** a domain may have only **one** SPF TXT record. If GoDaddy already
     publishes SPF for your `accounts@paperalien.com` mailbox (Microsoft 365 / GoDaddy email),
     **merge** Resend's `include:` into the existing record (e.g.
     `v=spf1 include:secureserver.net include:_spf.resend.com ~all`) — do **not** add a second SPF
     record.
3. Back in Resend, click **Verify**. It flips to *Verified* once the records resolve (can take a
   few minutes to an hour).
4. The app sends from `Fulfill <accounts@paperalien.com>` (`artifacts/api-server/src/lib/email.ts`).
   Optional: switch the `FROM` to a dedicated `noreply@paperalien.com` / `invites@paperalien.com`.
5. Ensure `RESEND_API_KEY` is set on Fly (Step 1).

## Step 5 — Deploy (merge `claude` → `main`)

CI (`.github/workflows/fly-deploy.yml`) deploys to Fly **only on push to `main`**. The Workspaces
feature currently lives on `origin/claude` (plus the deployment changes from this work).

1. Open a PR from `claude` → `main`, review, and merge.
2. The merge triggers GitHub Actions: typecheck → pm-app tests → drift/schema checks →
   `flyctl deploy`. The deploy's `release_command` runs `drizzle-kit push` against the production
   `DATABASE_URL` (creates/updates the schema on first deploy).
3. Watch it:
   ```bash
   fly logs -a fulfill-paperalien
   fly status -a fulfill-paperalien
   ```
   A failing CI check stops the deploy (nothing ships). A failing `release_command` (bad
   `DATABASE_URL`, no DB permission) shows in the release logs — fix the secret and redeploy.

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
