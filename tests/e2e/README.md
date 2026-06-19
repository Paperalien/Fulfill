# Local end-to-end (browser) tests

Browser-driven e2e tests for Fulfill. Flows here:

| Script | Auth? | What it covers |
|--------|-------|----------------|
| `todo-kanban-sync.mjs` | No (local/anonymous mode) | To-Do ↔ Kanban task + due-date sync. Spec: `tests/agent/todo-kanban-sync.md` |
| `authed-workspaces.mjs` | **Yes** | Workspaces lifecycle: personal → create → switch → rename → invite → planning poker → leave |
| `signin-account-load.mjs` | **Yes** | New-device sign-in: returning-user "Welcome back" acknowledgment + existing tasks load after login |

Each run records a `.webm` video + per-step screenshots + a `report.json` under `.e2e-out/`.

---

## Quickest path — one command

```bash
pnpm e2e:signin
```

`tests/e2e/run.mjs` does everything end-to-end and **always cleans up** (even on failure):
self-heals the local env (fetches the platform `@tailwindcss/oxide` native binding if the
`node_modules` was installed on another OS, ensures `CORS_ALLOWED_ORIGINS`, runs `drizzle push`
if the local schema is stale), starts the API + SPA if they aren't already up, then
**mint cloud user → seed local DB → drive Chrome → unseed → delete cloud user**.

It uses **`playwright-core` (a root devDependency) driving your system Google Chrome** — so the
`signin` flow needs *no* `npm i playwright` and no 300 MB browser download. (The two older scripts
above still import full `playwright`; see the manual setup below if you run them.)

> The runner is self-contained: it uses `artifacts/api-server/scripts/e2e-{mint,delete}-user.mjs`
> plus the `tests/e2e/{seed,unseed}-account.mjs` helpers. It does **not** depend on
> `lib/db/scripts/*` (those `truncate-all` / `delete-user` maintenance scripts live on a separate
> branch and are intentionally not used here — this runner never truncates; it removes only the one
> seeded test workspace + user).

---

---

## Why the authed flow needs a throwaway user (read this first)

The app's **database is local** (`postgresql://localhost:5432/fulfill_test`), but
**authentication is the real cloud Supabase project** — `artifacts/api-server/src/middlewares/auth.ts`
verifies every request's bearer token with `supabase.auth.getUser()`. There is no local
auth bypass. So to drive any *logged-in* flow you must hold a **real Supabase session**.

We get one by minting a disposable user via the service-role key, then **deleting it when
done**. Nothing else touches production — all task/workspace data stays in the local DB.

> ⚠️ **Always delete the test user at the end.** The create/test/delete lifecycle is the
> whole point of this doc — don't leave orphaned `fulfill-e2e+*@example.com` users in the
> Supabase auth project.

> 🔒 The minted session (`*.e2e-session.json`) contains live access/refresh tokens. It is
> git-ignored. Never commit it.

---

## One-time setup

```bash
# 1. A local Postgres test database with the full schema
createdb fulfill_test
DATABASE_URL="postgresql://localhost:5432/fulfill_test" pnpm -F @workspace/db run push

# 2. Playwright + a browser (kept out of the repo's pnpm workspace on purpose)
cd tests/e2e && npm init -y && npm i playwright && npx playwright install chromium
```

`artifacts/api-server/.env` and `artifacts/pm-app/.env` must be present (the mint script
reads `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `VITE_SUPABASE_ANON_KEY` from them).

---

## The flow: create user → test → remove user

```bash
# ── (1) MINT a throwaway cloud user + write its session ──────────────────────
node artifacts/api-server/scripts/e2e-mint-user.mjs
#   → writes artifacts/api-server/.e2e-session.json   (git-ignored)

# ── (2) SEED that user into the local users table (FK requirement, see R2) ───
USER=$(node -e "console.log(require('./artifacts/api-server/.e2e-session.json').userId)")
MAIL=$(node -e "console.log(require('./artifacts/api-server/.e2e-session.json').email)")
psql "postgresql://localhost:5432/fulfill_test" \
  -c "INSERT INTO users (id,email) VALUES ('$USER','$MAIL') ON CONFLICT (id) DO NOTHING;"
#   NOTE: once R2 is fixed (ensure-personal provisions the user), this step goes away.

# ── (3) START the API (local DB) and the SPA ─────────────────────────────────
( cd artifacts/api-server && pnpm run build && \
  set -a; . ./.env; set +a; \
  DATABASE_URL="postgresql://localhost:5432/fulfill_test" \
  CORS_ALLOWED_ORIGINS="http://localhost:5173" \
  APP_URL="http://localhost:5173" \
  NODE_ENV=development \
  node --enable-source-maps ./dist/index.mjs ) &
pnpm -F @workspace/pm-app dev &     # serves http://localhost:5173

# ── (4) RUN the recorded browser test ────────────────────────────────────────
cd tests/e2e
E2E_SESSION=../../artifacts/api-server/.e2e-session.json OUT=./.e2e-out node authed-workspaces.mjs
#   artifacts → tests/e2e/.e2e-out/  (git-ignored): authed-video/, authed-shots/, authed-report.json

# ── (5) DELETE the cloud user + session file (DO NOT SKIP) ────────────────────
node artifacts/api-server/scripts/e2e-delete-user.mjs

# ── (6) tear down servers; optionally drop the DB ────────────────────────────
#   kill the api/vite background jobs; `dropdb fulfill_test` if you want a clean slate
```

The anonymous flow needs none of steps 1, 2, 5 — just the SPA running:

```bash
pnpm -F @workspace/pm-app dev &
cd tests/e2e && OUT=./.e2e-out node todo-kanban-sync.mjs
```

---

## Gotchas (learned the hard way)

- **The API won't boot without `RESEND_API_KEY`** — `email.ts` constructs `new Resend(key)`
  at import, which throws on an empty key. Set a dummy value locally if you don't have one.
  (Tracked as R3.)
- **CORS denies everything unless `CORS_ALLOWED_ORIGINS` is set** (`app.ts`). Set it to
  `http://localhost:5173` or the browser calls fail.
- **Generated client targets `/api/...`** — keep `VITE_API_BASE_URL=http://localhost:3000`
  (no `/api` suffix).
- **Session injection** writes localStorage key `sb-<project-ref>-auth-token` before the app
  loads; the project ref is the Supabase URL subdomain.
- **Invite emails won't actually send** locally (dummy Resend key); the invite row is still
  created. (R3: failures are silently swallowed — `email.ts` ignores Resend's `{ error }`.)
