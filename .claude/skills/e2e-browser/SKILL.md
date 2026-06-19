---
name: e2e-browser
description: Run Fulfill's browser end-to-end tests (real Chrome against the local dev app), including the authenticated sign-in flow. Use when asked to verify/test/run the app in a browser, prove an auth or task-loading change end-to-end, or record a browser walkthrough.
---

# Fulfill browser e2e

Real-browser tests via `playwright-core` driving the **system Google Chrome** (no browser
download). Located in `tests/e2e/`. Each run records video + screenshots + `report.json` under
`tests/e2e/.e2e-out/` (git-ignored).

## Authenticated sign-in flow (the durable one) — one command

```bash
pnpm e2e:signin
```

This runs `tests/e2e/run.mjs`, which is self-healing and self-cleaning. It:
1. **ensure-env** — installs the platform `@tailwindcss/oxide` native binding if missing (the
   committed `node_modules` was built on Linux, so macOS lacks it and Vite won't boot otherwise);
   ensures `CORS_ALLOWED_ORIGINS` in `artifacts/api-server/.env`; runs `drizzle push` if the local
   schema is stale.
2. **servers** — starts the API (:3000) + SPA (:5173) if they aren't already up.
3. **mint → seed → drive → unseed → delete** — creates a throwaway cloud Supabase user, seeds its
   workspace + tasks into local Postgres, drives Chrome, then removes the rows and the cloud user.
   Cleanup runs even on failure.

It asserts: a returning user on a fresh browser sees the **"Welcome back"** acknowledgment (not
sign-up framing), and after sign-in the board **loads the account's existing tasks**.

## Why auth needs a throwaway cloud user

The DB is local but **auth is the real cloud Supabase project** — the API verifies bearer tokens
against Supabase's JWKS (`artifacts/api-server/src/middlewares/auth.ts`). There is no local auth
bypass, so any logged-in flow needs a real Supabase session. The runner mints one via the
service-role key and deletes it afterward. **Never leave `fulfill-e2e+*@example.com` users behind.**

## Prerequisites

- Local Postgres reachable via `DATABASE_URL` in `artifacts/api-server/.env` (host must be local).
- `artifacts/api-server/.env` has `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`;
  `artifacts/pm-app/.env` has `VITE_SUPABASE_ANON_KEY`.
- System Google Chrome installed.

## Anonymous flow (no auth)

```bash
pnpm -F @workspace/pm-app dev &
cd tests/e2e && OUT=./.e2e-out node todo-kanban-sync.mjs   # needs full `playwright` installed
```

## After running, look at the output

Read the screenshots in `tests/e2e/.e2e-out/signin-shots/` and the `.webm` — a green script line
is not proof; a blank frame is a failure. See `tests/e2e/README.md` for details and the manual
step-by-step equivalent.
