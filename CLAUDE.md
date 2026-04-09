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

# Type checking
pnpm run typecheck                    # Typecheck all packages (fastest correctness check)
pnpm run build                        # Full build (typecheck + compile all packages)

# Individual packages
pnpm -F @workspace/api-server run dev
pnpm -F @workspace/pm-app run dev
pnpm -F @workspace/api-server run typecheck
pnpm -F @workspace/pm-app run typecheck
```

There are no automated tests in this codebase.

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

## TypeScript

- All packages use composite project references; `pnpm run typecheck` from the root runs them all
- Only `.d.ts` files are emitted during typecheck (`emitDeclarationOnly`)
- Never run `tsc --noEmit` per-package when you can run the root typecheck

## Available Skills

- `/dev` — start api-server + pm-app in parallel
- `/codegen` — regenerate from OpenAPI spec
- `/db-push` — push Drizzle schema to local PostgreSQL
