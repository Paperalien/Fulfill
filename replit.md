# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server
│   └── pm-app/             # Project Management React app (localStorage only)
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts
├── guidelines/             # Development guidelines
│   └── Guidelines.md       # Data model update rules, seed versioning
├── pnpm-workspace.yaml     # pnpm workspace
├── tsconfig.base.json      # Shared TS options
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## Artifacts

### `artifacts/pm-app` (`@workspace/pm-app`) — Project Manager App

Full-featured project management app using React + Vite + Tailwind CSS v4. **No backend** — uses localStorage only.

**Features:**
- **6 Views**: To-Do List, Kanban Board, Sprint Management, Planning Poker, Done Folder, Trash Bin
- **Routing**: `react-router` (v7) with `createBrowserRouter`
- **Drag-and-drop Kanban**: `@hello-pangea/dnd`
- **Planning Poker**: Fibonacci voting (1, 2, 3, 5, 8, 13, 21)
- **Multi-field search**: Title, Description, Status, Story Points, Due Date, In Progress Date, Created Date — with date operators (=, >, <, ≥, ≤)
- **Keyboard shortcuts**: `/` and `Cmd-F/Ctrl-F` to focus search, `Esc` to clear
- **Done Folder**: Soft archive with unarchive capability
- **Trash Bin**: 30-day retention, soft delete/restore
- **Sort**: By any field, asc/desc
- **Seed data**: Versioned (`SEED_VERSION = 'v3'`), auto-seeds on first load or version bump

**Key files:**
- `src/app/types/task.ts` — Task & Sprint types
- `src/app/contexts/TaskContext.tsx` — Single source of truth
- `src/app/utils/storage.ts` — localStorage helpers
- `src/app/utils/seedData.ts` — SEED_TASKS, SEED_SPRINTS, SEED_VERSION
- `src/app/utils/searchUtils.ts` — filterTasks()
- `src/app/utils/sortUtils.ts` — sortTasksByField(), getSortLabel()
- `src/app/utils/useSearchShortcuts.ts` — keyboard shortcut hook
- `src/app/components/Layout.tsx` — sidebar navigation
- `src/app/components/SearchBar.tsx` — multi-field search component
- `src/app/components/TaskFields.tsx` — story points + due date fields
- `src/app/pages/` — TodoList, KanbanBoard, SprintManagement, PlanningPoker, DoneFolder, TrashBin
- `src/app/routes.tsx` — react-router createBrowserRouter config
- `guidelines/Guidelines.md` — update rules for data model changes

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded parsing, routes at `/api`
- Routes: `src/routes/index.ts` mounts sub-routers; `src/routes/health.ts` exposes `GET /healthz`
- Depends on: `@workspace/db`, `@workspace/api-zod`

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck`.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Guidelines

See `guidelines/Guidelines.md` for rules about:
- Data model update protocol
- SEED_VERSION bumping policy
- Seed data coverage requirements
