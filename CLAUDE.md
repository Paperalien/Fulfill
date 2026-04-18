# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

**Fulfill** is a pnpm monorepo: TypeScript/Express 5 API backend, React 19/Vite frontend, PostgreSQL via Drizzle ORM, Supabase authentication. The OpenAPI spec is the source of truth — client code and validators are generated from it via Orval.

## Common Commands

```bash
# Development (use skills instead of these directly)
pnpm run dev                          # Start api-server + pm-app in parallel (use /dev skill)
pnpm run codegen                      # Regenerate API client + Zod validators (use /codegen skill)
pnpm -F @workspace/db run push        # Apply schema migrations (use /db-push skill)

# Testing
pnpm -F @workspace/pm-app test        # Run Vitest unit tests
pnpm -F @workspace/pm-app test:watch  # Watch mode

# Type checking
pnpm run typecheck                    # Typecheck all packages (fastest correctness check)
pnpm run build                        # Full build (typecheck + compile all packages)

# Individual packages
pnpm -F @workspace/api-server run dev
pnpm -F @workspace/pm-app run dev
pnpm -F @workspace/api-server run typecheck
pnpm -F @workspace/pm-app run typecheck
```

Unit tests live in `artifacts/pm-app/src/` alongside their source files (`*.test.ts`, `*.test.tsx`). Run with `pnpm -F @workspace/pm-app test`.

## Monorepo Structure

```
artifacts/
  api-server/     # Express 5 REST API (port 3000)
  pm-app/         # React 19 + Vite SPA
lib/
  api-spec/       # openapi.yaml + orval.config.ts (source of truth)
  api-zod/        # Generated Zod validators (do not edit manually)
  api-client-react/ # Generated React Query hooks (do not edit manually)
  db/             # Drizzle ORM schema + connection
guidelines/       # Data model rules (Guidelines.md)
```

## Architecture: How Packages Connect

1. **`lib/api-spec/openapi.yaml`** — defines all API contracts
2. **Orval codegen** reads the spec and writes:
   - `lib/api-zod/src/generated/` — Zod schemas for request validation
   - `lib/api-client-react/src/generated/` — React Query hooks
3. **`artifacts/api-server`** — imports `@workspace/db` (Drizzle) and `@workspace/api-zod` (Zod validators); routes validate requests with Zod, query/mutate via Drizzle
4. **`artifacts/pm-app`** — imports `@workspace/api-client-react` hooks; `AuthContext` injects the Supabase bearer token via `setAuthTokenGetter()`

**Adding a new endpoint**: edit `openapi.yaml` → run `/codegen` → add route in `api-server/src/routes/` using generated Zod schemas → use generated hook in pm-app.

## API Server Patterns

- **Auth middleware** (`src/middlewares/auth.ts`): validates Bearer token via `supabase.auth.getUser()`, attaches `req.user`
- **Route registration** (`src/routes/index.ts`): workspace routes nested under `/workspaces/:workspaceId`
- **Validation pattern**: `ZodSchema.safeParse(req.body)` → 400 on failure; use generated schemas from `@workspace/api-zod`
- **Soft deletes**: tasks use `deletedAt` (Trash, 30-day retention) and `archivedAt` (Done Folder)

## PM App Patterns

- **`TaskContext`** (`src/app/contexts/TaskContext.tsx`): central state — wraps React Query hooks, normalizes API responses, exposes mutation handlers with optimistic updates
- **`AuthContext`** (`src/app/contexts/AuthContext.tsx`): Supabase session, workspace ID, calls `ensurePersonalWorkspace` on login
- All pages consume `useTaskContext()` and `useAuth()`; avoid calling API hooks directly in pages

## Phase 1.1 — Auth Redesign (local-first)

The auth system is being replaced with a local-first, account-optional model. **Do not add new code that assumes auth is required to use the app.**

**Architecture:**
- `TaskContext` must be storage-agnostic: same interface (`tasks`, `addTask()`, etc.) regardless of mode
- Local mode → reads/writes `localStorage`; authenticated mode → reads/writes API via React Query hooks
- `TaskContext` reads `AuthContext` to determine which backend to use; pages never know the difference

**First-run flow (single popover, two paths):**
```
App loads (full UI visible)
    ↓
Popover: "Want to save your data across devices?"
    ├── "Yes, I have an account" → email entry → magic link sent
    ├── "Yes, set me up"         → email entry → magic link sent
    └── "Not now" → dismiss → email icon appears top-left + toast: "You can save anytime via the icon ↖"
```
- Email icon is **always visible** top-left when unauthenticated; label: "Save your data"
- `/workspaces/ensure-personal` handles both new and returning users — no branching needed on the backend

**localStorage → server migration (triggered on magic link return):**
1. User clicks magic link → lands in app, now authenticated
2. App detects: fresh session + localStorage has data → show migration overlay ("Saving your data..." spinner, no %)
3. Upload in dependency order: columns → sprints → tasks
4. On success: clear localStorage, switch to auth mode
5. On failure: keep localStorage intact, show retry — data is never lost

**Deferred:** phone number / SMS OTP support (email magic link only for now)

### Implementation Plan (5 phases, in order)

**Phase 1 — Strip the auth gate** *(do first; unlocks browser testing of all later phases)*
1. `AuthContext.tsx` — add `isAuthenticated` (`!!session && !!workspaceId`), add `signInWithEmail(email)` via `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } })`, resolve `loading` as soon as `getSession()` returns (don't wait for workspace)
2. `ProtectedRoute.tsx` — gut to a pass-through (`return <>{children}</>`)
3. `routes.tsx` — remove the `/login` route
4. `Login.tsx` — delete after routes.tsx no longer imports it; also remove `@supabase/auth-ui-react` and `@supabase/auth-ui-shared` from package.json

**Phase 2 — Local storage backend for TaskContext**
5. New `src/app/lib/localStore.ts` — typed helpers: `readTasks/writeTasks`, `readSprints/writeSprints`, `readColumns/writeColumns`, `hasLocalData()`, `clearLocalData()`, `hasSeenFirstRun()`, `markFirstRunSeen()`; seeds default columns on first empty read; all reads wrapped in try/catch
6. New `useLocalTaskStore()` hook — same `TaskContextValue` interface as API store, backed by `useState` + localStore writes; uses `crypto.randomUUID()` for IDs; `loading` is always false (synchronous); skips snapshot recording effects
7. `TaskContext.tsx` — extract existing API logic into `useApiTaskStore(workspaceId)`; both hooks always called (React rules); context forwards whichever `isAuthenticated` selects

**Phase 3 — First-run popover and email icon**
8. New `src/app/components/SavePrompt.tsx` — auto-opens if `!hasSeenFirstRun()`; two panels (choice → "check your email"); "Not now" marks first-run seen + fires sonner toast; email submit calls `signInWithEmail()`; also accepts `open`/`onOpenChange` props for icon-triggered opens
9. New `src/app/components/AuthArea.tsx` — shows `<Mail>` icon + `<SavePrompt>` when unauthenticated; renders nothing (or account icon) when authenticated; manages shared `popoverOpen` state
10. `Layout.tsx` — add `<AuthArea />` to sidebar header *(only existing component touched outside contexts)*
11. `App.tsx` — ensure `<Toaster />` is present

**Phase 4 — Migration flow**
12. New `src/app/components/MigrationOverlay.tsx` — full-screen spinner "Saving your data..." with retry button on error; props: `status: 'idle' | 'migrating' | 'error'`, `onRetry`
13. New `src/app/hooks/useMigration.ts` — detects `isAuthenticated && workspaceId && hasLocalData()`; uploads sequentially: columns → sprints → tasks; after uploading columns, builds `Map<localId, serverAssignedId>` and remaps `task.columnId` before uploading tasks (server assigns new IDs, local UUIDs are discarded); same for sprint IDs; on success: `clearLocalData()` + `queryClient.invalidateQueries`; on failure: keeps localStorage, sets `status = 'error'`
14. New `MigrationBoundary` component in `App.tsx` — wraps `TaskProvider`, uses `useMigration`, renders `<MigrationOverlay>`

**Phase 5 — Testing (Vitest)**
15. Add `vitest`, `@testing-library/react`, `@testing-library/user-event` to pm-app devDependencies
16. `localStore.test.ts` — unit tests for all read/write/clear/seed functions
17. `useMigration.test.ts` — mock API hooks; test sequencing, ID remapping, error/retry, localStorage cleared on success
18. `useLocalTaskStore.test.ts` — verify mutations update state and localStorage together
19. `SavePrompt.test.tsx` — three UI states: auto-open, email submit → check-email panel, dismiss → `hasSeenFirstRun` set

### Key gotchas
- **Dual-hook pattern**: both `useLocalTaskStore` and `useApiTaskStore` must always be called (hooks rules); API hooks are no-ops when `workspaceId` is null via `enabled: !!workspaceId`
- **ID remapping during migration**: server assigns new column/sprint IDs; build a remap Map after each upload batch and patch downstream references before uploading tasks
- **`isAuthenticated` vs `!!session`**: switching TaskContext to API mode too early (before `workspaceId` resolves) causes one bad render cycle with null workspaceId — use `!!session && !!workspaceId`
- **Magic link fragment**: Supabase auto-handles `#access_token` in `onAuthStateChange`; no `/auth/callback` route needed as long as `detectSessionInUrl` is not disabled in `supabase.ts`

### Dev testing without real email
- **Supabase local stack**: `supabase start` (requires Docker) → magic links appear in Inbucket at `localhost:54324`; point `.env` at `http://localhost:54321`
- **Dev state panel**: floating panel in `DEV` mode only with buttons to jump to any state (empty local, seeded local, first-run popover, post-migration) without email or DB

## Database Schema (Key Fields)

Drizzle schema lives in `lib/db/src/schema/`. Key semantic fields on `tasks`:

| Field | Meaning |
|-------|---------|
| `columnId` | Current kanban column |
| `semanticStatus` (on column) | `not-started` \| `in-progress` \| `done` — used to filter views, not column name |
| `inProgressAt` | Set when task enters an `in-progress` column; cleared on exit |
| `archivedAt` | Non-null = Done Folder (`archivedAt && !deletedAt`) |
| `deletedAt` | Non-null = Trash (soft delete) |
| `parentId` | Subtask parent (self-referential) |
| `predecessorIds` | Text array of blocking task IDs |
| `recurrence` | `daily` \| `weekly` \| `monthly` |

After modifying the Drizzle schema, run `/db-push` to apply changes.

## Environment Variables

**`artifacts/api-server/.env`** (see `.env.example`):
```
PORT=3000
DATABASE_URL=postgresql://...
SUPABASE_URL=https://[project].supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
```

**`artifacts/pm-app/.env`** (see `.env.example`):
```
VITE_API_BASE_URL=http://localhost:3000
VITE_SUPABASE_URL=https://[project].supabase.co
VITE_SUPABASE_ANON_KEY=...
```

## Testing

- **Plan tests alongside features.** When planning any new feature or non-trivial change, include a testing step in the plan. Identify which units are worth testing (pure functions, hooks with branching logic, UI flows with multiple states) and write the tests as part of the same task — not as an afterthought.
- **Run tests before committing.** Always run `pnpm -F @workspace/pm-app test` before creating a commit that touches `artifacts/pm-app/`. All tests must pass. If a test fails, fix it or (if the test is wrong) update it with a clear reason — do not skip or disable tests to make the commit pass.
- **Test file conventions:** co-locate test files with their source (`localStore.test.ts` next to `localStore.ts`); use `vi.hoisted()` for mock refs that need to be shared across `vi.mock()` factories; use `happy-dom` (configured globally via `vite.config.ts`).

## Pre-commit Checklist

Before every `git commit`, run `pnpm run typecheck` and ensure it exits clean. **This includes pre-existing errors** — do not commit if any typecheck errors exist, even ones not introduced by the current change. Fix all errors first. If an error cannot be fixed (e.g. it requires regenerating code via `/codegen` or `/db-push` that isn't safe to run in the current context), stop the task and explain clearly:
- What the error is
- Why it cannot be fixed right now
- What the user needs to do to resolve it before the commit can proceed

## TypeScript

- All packages use composite project references; `pnpm run typecheck` from the root runs them all
- Only `.d.ts` files are emitted during typecheck (`emitDeclarationOnly`)
- Never run `tsc --noEmit` per-package when you can run the root typecheck

## Available Skills

- `/dev` — start api-server + pm-app in parallel
- `/codegen` — regenerate from OpenAPI spec
- `/db-push` — push Drizzle schema to local PostgreSQL
