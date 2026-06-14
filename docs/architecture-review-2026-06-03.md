# Architecture & Code Review — Fulfill

**Reviewed at commit:** `b5938ac579a90e5c46acd19c9550835763c66d31`  
**Branch:** `copilot/create-repository-dead-mans-switch`  
**Date:** 2026-06-03  
**Reviewer:** Claude (claude-sonnet-4-6) — prompted by Christian

All findings below are anchored to the codebase state at the commit above. Re-evaluate any finding before acting on it if significant time has passed.

---

## Part 1: Senior Architect View — Production & Scalability

### 1.1 The Drizzle Push Problem (Critical)

The `fly.toml` release command is:

```toml
release_command = "pnpm -F @workspace/db run push"
```

`drizzle-kit push` is a **development tool**. It inspects the live database schema, diffs it against your TypeScript schema, and emits destructive DDL to reconcile them — including `DROP COLUMN`, `DROP TABLE`, and re-creations. It has no migration history, no rollback, and no lock. Running it as the release command of a production deployment means every deploy is a potential data-loss event.

The correct production path is `drizzle-kit generate` (produces SQL migration files, committed to git) and `drizzle-kit migrate` (applies only unapplied migrations in order).

**Fix:** Switch `fly.toml` release command from `push` to `migrate`. Commit all existing schema state as a baseline migration file. From that point on, all schema changes must go through `drizzle-kit generate`.

---

### 1.2 The Scheduler in a Serverless-ish Environment (Critical)

`artifacts/api-server/src/agents/scheduler.ts` runs the trash purge via `setTimeout` + `setInterval` bound to the Node.js process. `fly.toml` has `min_machines_running = 0` and `auto_start_machines = true`.

**Problems:**

- **Uncoordinated multi-instance runs:** If traffic spikes cause Fly to spin up multiple machines, each machine starts its own scheduler. The purge (`DELETE WHERE deletedAt < now() - 30 days`) runs N times concurrently. Not data-corrupting, but uncontrolled and wasteful.
- **Cold-start coupling:** With `min_machines_running = 0`, every cold start restarts the scheduler. Sporadic traffic = multiple scheduler restarts = purge running far more than once a day.
- **No persistence or dead-letter:** If the machine dies mid-purge, there is no record of whether it ran or what it deleted.
- **No SIGTERM handling:** Fly sends SIGTERM on deploy/scale-down. The in-flight transaction is abandoned without cleanup.

**Fix options (pick one):**
1. Fly.io `[processes]` — a dedicated cron machine running `node dist/agents/scheduler.js` with `min_machines_running = 1`. Isolates scheduling from the API process.
2. Supabase `pg_cron` extension — run the purge as a database job. No application code involved.
3. A proper job queue (BullMQ + Redis) if you add more background jobs in the future.

---

### 1.3 Auth Middleware Makes a Network Call Per Request (High)

```typescript
// artifacts/api-server/src/middlewares/auth.ts
const { data, error } = await supabase.auth.getUser(token);
```

`supabase.auth.getUser()` makes an HTTP request to the Supabase Auth API on every authenticated request. Under load this means:

- Every request carries 50–150ms of external HTTP latency added to its response time.
- You are subject to Supabase Auth's rate limits.
- If Supabase Auth has any outage, your entire API returns 401s — Supabase's uptime becomes your API's uptime.
- 100 concurrent requests = 100 simultaneous outbound HTTP calls from a 256MB machine.

Supabase JWTs are signed RS256 tokens. They can be verified **locally** using your project's JWT secret (Supabase dashboard → Project Settings → API → JWT Secret). Local verification is a pure-CPU operation taking microseconds, with no network dependency.

**Fix:** Replace `supabase.auth.getUser(token)` with local JWT verification via `jose` or `jsonwebtoken`. Reserve the remote `getUser()` call for operations that need real-time session revocation checks (password changes, account deletion, suspicious activity detection).

---

### 1.4 No Database Connection Pool (High)

`lib/db/src/index.ts` creates a direct `postgres` connection. The Supabase free tier allows 60 connections; pro allows 200. Each Fly machine under load holds connections open per active request. Across multiple machines or under concurrent load, you will hit `too many connections` errors.

**Fix:** Connect to Supabase via the PgBouncer endpoint (port `6543` instead of `5432`) in transaction pooling mode. This is available on all Supabase projects at no extra cost. No code changes required — only the `DATABASE_URL` in Fly secrets changes.

---

### 1.5 The "Ensure Personal Workspace" Race Condition (High)

`artifacts/api-server/src/routes/workspaces.ts` — the `POST /workspaces/ensure-personal` handler runs:

```typescript
await db.transaction(async (tx) => {
  const [existing] = await tx.select()...where(eq(workspacesTable.ownerId, userId));
  if (existing) return existing;
  const [workspace] = await tx.insert(workspacesTable)...
  // 4 column inserts follow
});
```

Two simultaneous requests (browser double-tap, network retry, or two tabs) can both pass the `SELECT` check before either `INSERT` completes, creating two workspaces for the same user. The user's data then lands in whichever workspace the frontend happens to use, and the other orphaned workspace accumulates nothing.

**Fix:** Add a `UNIQUE` constraint on `workspaces.owner_id` in the schema. Replace the select-then-insert with `INSERT ... ON CONFLICT (owner_id) DO NOTHING RETURNING *`, then fall back to a `SELECT` if the insert returned nothing. This makes the operation atomic at the database level.

---

### 1.6 No Shared Workspace / Multi-User Authorization Model (High)

The current workspace authorization in `requireWorkspaceAccess.ts`:

```typescript
if (workspace.ownerId !== req.user!.id) {
  res.status(403).json({ error: "Forbidden" });
}
```

This is an **owner-equals-user** model. There is no `workspace_members` table, no roles (admin/member/viewer), no invitation flow. If shared workspaces are added later, this middleware requires a complete rewrite, and every route that assumes `ownerId === currentUser` needs auditing.

**The cost of waiting:** Every other table (`tasks`, `columns`, `sprints`, `sprint_snapshots`) FKs to `workspaces`. Adding a `workspace_members` join table later means a production migration on the central table, plus re-auditing every authorization check in every route.

**Fix:** Add the data model now, even if the feature ships empty. Add `workspace_members(workspace_id, user_id, role ENUM('admin','member','viewer'), invited_at, accepted_at)`. Backfill the current owner as `admin`. Update `requireWorkspaceAccess` to check membership instead of ownership. The UI feature can ship later; the schema needs to be right first.

---

### 1.7 No Pagination, No Query Budget (Medium)

Every collection endpoint returns the full dataset with no `LIMIT`:

```typescript
// artifacts/api-server/src/routes/tasks.ts
const tasks = await db.select().from(tasksTable)
  .where(and(eq(tasksTable.workspaceId, workspaceId), isNull(tasksTable.deletedAt)));
```

A workspace with 10,000 tasks sends 10,000 rows over the wire on every page load. The database also has no index on `deleted_at`, so `WHERE workspace_id = X AND deleted_at IS NULL` does a full index scan on `workspace_id` then filters `deleted_at` in memory.

**Fix (two steps):**
1. Add a composite index on `(workspace_id, deleted_at)` on the tasks table in the Drizzle schema.
2. Add cursor-based pagination using the existing `order` field. Tasks are already ordered; a `?after=<order_value>&limit=100` parameter is the minimum viable change.

---

### 1.8 `fly.toml` Contains Supabase Project URL in Git History (Low-Medium)

```toml
[build.args]
  VITE_SUPABASE_URL = "https://jxdhdyxivyrmkeuxisre.supabase.co"
  VITE_SUPABASE_ANON_KEY = "sb_publishable_fFBBT56oDE0jr7y7VCeCEw_FFVr6Wdc"
```

The anon key is a publishable key by design — it's safe to be public. However the project URL reveals your Supabase project ID, which is enough to enumerate the Auth API, attempt signups against your project, and probe any publicly accessible storage buckets or Edge Functions. This project intentionally bypasses Row Level Security (RLS) in favor of application-level auth, which means the anon key's effective power is limited — but the project URL is now permanently in git history.

**Mitigation:** This cannot be undone from git history without a force-push. For the future, pass these via Fly.io build secrets (`fly secrets set --stage`) rather than committed `fly.toml` build args. The actual risk is low given the anon key's limited permissions; flag it for awareness, not immediate action.

---

## Part 2: Code Review — Average Software Engineer

An engineer at median industry experience would write exactly this code. The patterns are competent and correct.

### Strengths

- The Zod validation + OpenAPI codegen pipeline is solid. Using `safeParse()` rather than `parse()` (which throws) throughout is the right call for an HTTP context.
- Transaction usage in `artifacts/api-server/src/routes/sprints.ts` for the "only one active sprint" invariant is exactly right. Many average engineers miss that this needs a transaction.
- The pino logger with redaction of `authorization` and `cookie` headers shows real production awareness.
- The optimistic update pattern in `TaskContext.tsx` — cancel, snapshot, set optimistic, rollback on error, invalidate on settle — is textbook React Query and is implemented correctly.

### Issues

**Redundant auth checks in route handlers.** Several files (`columns.ts:16–19`, `sprint-snapshots.ts:14–17`) open with:

```typescript
if (!req.user) {
  res.status(401).json({ error: "Unauthorized" });
  return;
}
```

...after `requireAuth` and `requireWorkspaceAccess` have already verified `req.user` is set. This reveals uncertainty about whether the middleware will always run, which in turn reveals a lack of middleware-layer tests. The fix is tests on the middleware, not more guards in the handlers.

**`TaskContext.tsx` is 611 lines.** It handles task CRUD, bulk operations, archiving, deletion, column management, sprint management, snapshot recording, and optimistic updates — all in one context. This is the classic "it works so we never split it" growth pattern. When the next engineer needs to touch sprint logic, they'll load the entire task context into their head to find it.

**`migrate.ts` is a procedural script in a route handler.** The ID-remapping algorithm (building `Map<localId, serverId>` for columns, sprints, and tasks, then patching foreign keys) is a non-trivial piece of logic embedded directly in an HTTP handler with no unit tests. This is exactly the category of code where bugs appear three months after ship when someone has a task whose `parentId` points to another task in the same migration batch.

**Inconsistent parameter destructuring.** Some routes destructure `req.params` at the top; others access `req.params.workspaceId` inline. Neither is wrong; the inconsistency indicates no enforced style convention.

---

## Part 3: Code Review — Fresh CS Graduate (MIT / Caltech / Imperial)

A fresh graduate from a top CS program brings strong theoretical foundations and recently learned best practices. They also bring two blind spots: they haven't been paged at 3am for a production incident, and they haven't developed the intuition for what matters versus what's merely elegant.

### What They'd Write Well

The overall architecture shows exactly the judgment a recent grad who did their homework would apply: one source of truth (OpenAPI spec), generate everything else (Zod validators, React Query hooks). The TypeScript is thorough and consistent. The schema separation (each table in its own file, all re-exported from `schema/index.ts`) is clean.

### Academic Tells

**Optimistic ID format.** The current implementation:
```typescript
const optimisticId = `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
```
A recent grad knows about `crypto.randomUUID()` and would use it. The string-prefixed format suggests copying a tutorial example. `crypto.randomUUID()` is available natively in Node.js 19+ and produces a collision-resistant ID without the timestamp-plus-weak-random construction.

**What they'd flag that senior engineers accept.** The `requireWorkspaceAccess` middleware fetches the workspace from the database and then discards it:

```typescript
// middlewares/requireWorkspaceAccess.ts
const [workspace] = await db.select().from(workspacesTable).where(...);
if (!workspace || workspace.ownerId !== req.user!.id) { ... }
// workspace is dropped — route handlers that need it fetch it again
```

Some route handlers that genuinely need workspace data after this point do a second database lookup. A recent grad who just finished a systems course would immediately flag this as an unnecessary round-trip and attach `req.workspace = workspace`. They would be correct. The fix is straightforward: add `workspace` to the Express `Request` type augmentation in `src/types/express.d.ts` and assign it in the middleware.

### What They'd Miss

The scheduler problem, the cold-start behavior on `min_machines_running = 0`, the Drizzle push-in-production issue, the Supabase auth network call per request — none of these would be on their radar. They'd assume the framework and platform handle it. The "ensure personal workspace" race condition specifically requires experience with concurrent distributed systems to recognize; it's not in any coursework syllabus.

### What They'd Over-engineer

A recent grad who aced their software engineering course would look at routes like `tasks.ts` — which does HTTP handling, business logic, and database access in the same file — and want to introduce a repository pattern, a service layer, and dependency injection (perhaps `tsyringe` or `inversify`). They'd be architecturally correct that the layers are mixed. For an application of this scale, that indirection would slow development without improving reliability. The YAGNI principle is learned from production experience, not textbooks.

---

## Backlog: Prioritized Action List

### P0 — Fix Before Next Production Deploy

| # | Finding | File(s) | Effort |
|---|---------|---------|--------|
| 1 | Switch release command from `drizzle-kit push` to `drizzle-kit migrate` | `fly.toml`, `lib/db/` | ~4h |
| 2 | Local JWT verification instead of `supabase.auth.getUser()` per request | `artifacts/api-server/src/middlewares/auth.ts` | ~2h |
| 3 | Unique constraint on `workspaces.owner_id` + atomic upsert pattern | `lib/db/src/schema/workspaces.ts`, `artifacts/api-server/src/routes/workspaces.ts` | ~1h |

### P1 — Fix Within the Next Sprint

| # | Finding | File(s) | Effort |
|---|---------|---------|--------|
| 4 | Switch `DATABASE_URL` to PgBouncer endpoint (port 6543) | Fly.io secrets only, no code | ~30m |
| 5 | Move scheduler to a dedicated Fly process or Supabase pg_cron | `fly.toml`, `artifacts/api-server/src/agents/` | ~3h |
| 6 | Add composite index `(workspace_id, deleted_at)` on tasks | `lib/db/src/schema/tasks.ts` | ~30m |
| 7 | Attach `workspace` to `req` in `requireWorkspaceAccess`; remove redundant handler checks | `middlewares/requireWorkspaceAccess.ts`, `src/types/express.d.ts`, route files | ~2h |
| 8 | Add unit tests for `migrate.ts` ID-remapping logic | new test file | ~3h |

### P2 — Technical Debt, Address Before Shared Workspace Ships

| # | Finding | File(s) | Effort |
|---|---------|---------|--------|
| 9 | Add `workspace_members` table + role enum; update auth middleware | `lib/db/src/schema/`, `middlewares/requireWorkspaceAccess.ts` | ~1d |
| 10 | Add helmet middleware for security headers | `artifacts/api-server/src/app.ts` | ~30m |
| 11 | Add rate limiting to mutation endpoints (not just `check-email`) | `artifacts/api-server/src/app.ts` or per-router | ~2h |
| 12 | Cursor-based pagination on collection endpoints | `artifacts/api-server/src/routes/tasks.ts`, sprints, columns | ~1d |
| 13 | Split `TaskContext.tsx` (611 lines) into task, sprint, and column contexts | `artifacts/pm-app/src/app/contexts/` | ~1d |

### P3 — Nice to Have

| # | Finding | File(s) | Effort |
|---|---------|---------|--------|
| 14 | Replace `optimistic-${Date.now()}-${Math.random()}` with `crypto.randomUUID()` | `artifacts/pm-app/src/app/contexts/TaskContext.tsx` | ~15m |
| 15 | Add SIGTERM handler for graceful drain | `artifacts/api-server/src/index.ts` | ~1h |
| 16 | Audit logging for data mutations (who changed what, when) | new middleware or per-route | ~2d |
| 17 | Enforce consistent `req.params` destructuring style via ESLint rule or convention doc | various route files | ~1h |
