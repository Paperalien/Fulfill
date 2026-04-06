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

**Views (7):**
- **To-Do List** (`/`) — checkbox list with inline editing, subtasks, archive-done button
- **Kanban Board** (`/kanban`) — drag-and-drop columns, configurable columns, edit modal
- **Sprint Management** (`/sprints`) — sprint CRUD, active sprint with stats, backlog
- **Planning Poker** (`/planning-poker`) — Fibonacci voting for story point estimation
- **Done Folder** (`/done`) — archived tasks with unarchive capability
- **Trash Bin** (`/trash`) — 30-day soft-delete retention with restore
- **Charts** (`/charts`) — Sprint Charts (velocity, burndown, burnup) + Todo Charts (status pie, backlog aging, completion trend)

**Features:**
- **Drag-and-drop Kanban**: `@hello-pangea/dnd`
- **Configurable columns**: add/rename/reorder/delete columns with semantic status (not-started, in-progress, done) and colors
- **Subtasks**: single-level parent/child with progress counters
- **Tags**: many-to-many labels with tag input + badge components
- **Predecessors**: task dependency tracking (`predecessorIds`)
- **Story Points**: Fibonacci (1, 2, 3, 5, 8, 13, 21)
- **Reminders**: `'day-before'`, `'on-due-date'`, or a specific `YYYY-MM-DD` date; `ReminderBanner` shown at top of layout; dismissal persists until reminder date changes
- **Recurrence**: `'daily'` | `'weekly'` | `'monthly'`; spawns a new task on done-transition
- **Multi-field search**: Title, Notes, Status, Tags, Story Points, Due Date, In Progress Date, Created Date — with date operators (=, >, <, ≥, ≤)
- **Keyboard shortcuts**: `/` and `Cmd-F/Ctrl-F` to focus search, `Esc` to clear
- **Sort**: By any field, asc/desc
- **In-progress badge**: shows time elapsed since task entered an in-progress column
- **Charts**: Recharts-based; daily snapshots stored in localStorage for burndown/burnup; completion trend over 30 days
- **Seed data**: Versioned (`SEED_VERSION = 'v4'`), auto-seeds on first load or version bump

**Data model notes:**
- `Task.notes` (not `description`) — renamed in Task #2; backwards-compat migration in `getTasks()` handles existing localStorage data with the old `description` key
- `SearchField` union uses `'notes'` (not `'description'`)
- No state machine / no column transition rules — columns are free-move buckets only

**Key files:**
- `src/app/types/task.ts` — Task, Sprint, KanbanColumn types; SearchField, DateOperator, SortOrder
- `src/app/contexts/TaskContext.tsx` — single source of truth; addTask, updateTask, deleteTask, archiveDoneTasks, recurrence spawn logic
- `src/app/utils/storage.ts` — localStorage helpers; `getTasks()` includes `description→notes` migration; `recordDailySnapshots()`, `getSprintSnapshots()` for charts
- `src/app/utils/seedData.ts` — SEED_TASKS, SEED_SPRINTS, SEED_COLUMNS, SEED_VERSION (`'v4'`)
- `src/app/utils/searchUtils.ts` — filterTasks()
- `src/app/utils/sortUtils.ts` — sortTasksByField(), getSortLabel(), SORT_FIELD_LABELS
- `src/app/utils/taskUtils.ts` — getSemanticStatus(), computeNextDueDate(), isReminderActive(), getSubtasks(), getSubtaskProgress()
- `src/app/components/Layout.tsx` — sidebar navigation (7 items)
- `src/app/components/SearchBar.tsx` — multi-field search + sort
- `src/app/components/TaskEditModal.tsx` — full edit modal (named export)
- `src/app/components/TaskFields.tsx` — story points + due date fields (default export)
- `src/app/components/ReminderBanner.tsx` — dismissible reminder banner at top of layout (named export)
- `src/app/components/ReminderRecurrenceFields.tsx` — reminder + recurrence form fields (default export)
- `src/app/components/TagInput.tsx` — TagInput + TagBadge (named exports)
- `src/app/components/InProgressBadge.tsx` — in-progress elapsed time badge (named export)
- `src/app/pages/` — TodoList, KanbanBoard, SprintManagement, PlanningPoker, DoneFolder, TrashBin, Charts
- `src/app/routes.tsx` — react-router createBrowserRouter config (7 routes)
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
