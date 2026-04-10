# Fulfill — Data Model & Architecture Guidelines

## Product Principles
- **No state machines, no transition rules.** Columns are free-move buckets. Any task can move to any column at any time. This is an explicit design decision to avoid the Jira anti-pattern.
- **Local-first, account-optional.** The app works immediately without sign-in. Data is stored in localStorage and synced to the server when the user adds an email.
- **Simple but powerful:** 80/20 rule — build what genuinely helps small teams without enterprise complexity.
- **Product tiers:** Free (current feature set + subtasks + tags) | Team ($5/user; sprints, planning poker, predecessors) | Enterprise (Gantt, saved views, custom fields — future).

---

## Architecture

Fulfill is a pnpm monorepo:

| Package | Role |
|---|---|
| `artifacts/api-server` | Express 5 REST API (port 3000), PostgreSQL via Drizzle ORM |
| `artifacts/pm-app` | React 19 + Vite SPA (port 5173) |
| `lib/api-spec` | `openapi.yaml` — source of truth for all API contracts |
| `lib/api-zod` | Generated Zod validators (do not edit manually) |
| `lib/api-client-react` | Generated React Query hooks (do not edit manually) |
| `lib/db` | Drizzle ORM schema + connection |

**Adding a new endpoint:** edit `openapi.yaml` → run `/codegen` → add route in `api-server/src/routes/` → use generated hook in pm-app.

---

## Auth Model

- **Supabase** for magic link (OTP) authentication — no passwords, no SMS OTP (deferred).
- `AuthContext` exposes `isAuthenticated` (`!!session && !!workspaceId`), `signInWithEmail(email)`, `signOut()`.
- `loading` resolves as soon as `getSession()` returns — does **not** wait for workspace resolution.
- `ProtectedRoute` is a no-op pass-through; the app renders immediately without authentication.

### First-run flow
```
App loads (full UI, no gate)
    ↓
SavePrompt auto-opens if !hasSeenFirstRun()
    ├── "Yes, set me up" → email entry
    │       ↓
    │   If local data + email already has server data → merge-confirm dialog
    │       ├── Cancel  → abort entirely (no OTP sent, nothing changes)
    │       └── Merge   → send magic link → user clicks → migration runs
    └── "Not now" → dismiss → Mail icon stays visible top-left
```

- The **Mail icon** ("Save your data") is always visible in the sidebar header when unauthenticated.
- Re-clicking it re-opens the same flow; if the email already has server data and the user has local data, the merge-confirm appears again.

### localStorage → server migration
Triggered automatically when `isAuthenticated && workspaceId && hasLocalData()`:
1. Dispatch `fulfill:flush-edits` event → any open `TaskEditModal` auto-saves dirty state to localStorage.
2. Single `POST /workspaces/{wid}/migrate` call (bulk, atomic DB transaction, 60s timeout).
3. Server deduplicates columns by `name + semanticStatus`; remaps `columnId`, `sprintId`, `parentId`, `predecessorIds` to server-assigned IDs.
4. On success: `clearLocalData()` + React Query cache invalidation.
5. On failure: localStorage untouched; `MigrationOverlay` shows retry button.

---

## Data Model

### KanbanColumn
```typescript
{
  id: string;
  name: string;
  order: number;          // 0-indexed sort position
  semanticStatus: 'not-started' | 'in-progress' | 'done';
  color?: string;         // gray | blue | purple | green | orange | red | yellow
}
```

Default seeded columns (used in both local and server modes):
```
To Do        (not-started, gray)
In Progress  (in-progress, blue)
In Review    (in-progress, purple)
Done         (done, green)
```

### Task
```typescript
{
  id: string;
  title: string;
  notes: string;               // renamed from `description` in v5
  columnId: string;
  storyPoints?: number;        // Fibonacci: 1, 2, 3, 5, 8, 13, 21
  createdAt: string;           // ISO timestamp
  updatedAt: string;           // ISO timestamp
  sprintId?: string;
  order: number;
  archivedAt?: string;         // Set when moved to Done folder
  deletedAt?: string;          // Set when soft-deleted to Trash (30-day retention)
  dueDate?: string;            // YYYY-MM-DD
  inProgressAt?: string;       // Set when moved into an in-progress column; cleared on exit
  parentId?: string;           // Single parent task (subtask tree)
  predecessorIds?: string[];   // Tasks that must complete before this one
  tags?: string[];             // Many-to-many labels
  reminder?: string;           // 'day-before' | 'on-due-date' | 'YYYY-MM-DD'
  reminderDismissedAt?: string;// YYYY-MM-DD — last date reminder was dismissed
  recurrence?: 'daily' | 'weekly' | 'monthly';
}
```

### Sprint
```typescript
{
  id: string;
  name: string;
  startDate: string;   // YYYY-MM-DD
  endDate: string;     // YYYY-MM-DD
  isActive: boolean;
}
```

---

## Key Design Decisions

### Status via SemanticStatus, not enum
- `columnId` points to a `KanbanColumn` which has a `semanticStatus`.
- Helper: `getSemanticStatus(task, columns): SemanticStatus` in `utils/taskUtils.ts`.
- All views use `semanticStatus` for filtering, never the column name.

### inProgressAt behavior
- **Set** when task moves INTO a column with `semanticStatus === 'in-progress'`.
- **Cleared** when task moves OUT of an in-progress column.
- Managed client-side in both `useApiTaskStore` and `useLocalTaskStore`.

### Archive vs Delete
- **Archive** (`archivedAt`): Done Folder. Shown when `archivedAt && !deletedAt`.
- **Delete** (`deletedAt`): Trash. Permanently removed after 30 days.
- `archiveDoneTasks()`: bulk-archives all tasks in `done` columns.

### Subtasks via parentId
- `parentId?: string` — single parent, unlimited depth, no named hierarchy levels.
- Subtask progress: count children with `semanticStatus === 'done'`.

### Tags
- `tags: string[]` — lowercase, hyphenated (e.g. `"backend"`, `"in-review"`).
- Labels, not containers. Many-to-many.

### Configurable Kanban Columns
- Add, rename, reorder, delete columns from the Kanban board.
- Deleting a column reassigns its tasks to a fallback column.
- Multiple columns can share the same `semanticStatus`.
- **No transition rules. Ever.**

### Phone number / SMS OTP
- **Deferred.** Email magic link only for now.

---

## Storage Layer

`TaskContext` is storage-agnostic. It always calls both hooks and forwards to whichever the auth state selects:

| Mode | Hook | Backend |
|---|---|---|
| Unauthenticated | `useLocalTaskStore` | `localStorage` via `lib/localStore.ts` |
| Authenticated | `useApiTaskStore` | REST API via React Query |

`localStorage` keys:
- `fulfill:tasks`, `fulfill:sprints`, `fulfill:columns`
- `fulfill:first-run-seen`

`readColumns()` auto-seeds default columns on first empty read.
`hasLocalData()` returns `true` if tasks/sprints exist, or if columns differ from the default seed.

---

## File Structure

```
artifacts/
  api-server/src/
    app.ts                    # Express app setup (body limit: 2mb)
    routes/
      index.ts                # Router: public routes → requireAuth → protected routes
      health.ts               # GET /healthz
      users.ts                # POST /users/check-email (public)
      workspaces.ts           # POST /workspaces/ensure-personal
      migrate.ts              # POST /workspaces/:id/migrate (bulk atomic migration)
      tasks.ts                # CRUD + bulk-archive + recurrence
      sprints.ts              # Sprint CRUD
      columns.ts              # Column CRUD + reorder
      sprint-snapshots.ts     # Burndown snapshot upsert
    middlewares/
      auth.ts                 # Bearer token validation via Supabase

  pm-app/src/app/
    types/task.ts             # Task, Sprint, KanbanColumn, SemanticStatus, DEFAULT_COLUMNS
    contexts/
      AuthContext.tsx         # session, workspaceId, isAuthenticated, signInWithEmail, signOut
      TaskContext.tsx         # TaskContextValue, TaskProvider (dual-hook), useTaskContext
    hooks/
      useLocalTaskStore.ts    # TaskContextValue backed by localStorage
      useMigration.ts         # Detects auth + local data; runs bulk migration
    lib/
      localStore.ts           # readTasks/writeTasks, readColumns (seeds defaults), hasLocalData, etc.
      supabase.ts             # Supabase client
    components/
      Layout.tsx              # Sidebar nav + AuthArea
      AuthArea.tsx            # Mail icon + SavePrompt; hides when authenticated
      SavePrompt.tsx          # First-run popover: choice → email → merge-confirm → sent
      MigrationOverlay.tsx    # Full-screen spinner during migration; retry on error
      TaskEditModal.tsx       # Listens for fulfill:flush-edits to auto-save dirty state
      ProtectedRoute.tsx      # No-op pass-through (auth gate removed)
    pages/
      TodoList.tsx
      KanbanBoard.tsx
      SprintManagement.tsx
      PlanningPoker.tsx
      Charts.tsx
      DoneFolder.tsx
      TrashBin.tsx

lib/
  api-spec/openapi.yaml       # Source of truth — edit here, then run /codegen
  api-zod/src/generated/      # Do not edit — generated by Orval
  api-client-react/src/generated/  # Do not edit — generated by Orval
  db/src/schema/              # Drizzle table definitions
```

---

## Route Paths

- `/` — To-Do List
- `/kanban` — Kanban Board
- `/sprints` — Sprint Management
- `/planning-poker` — Planning Poker
- `/charts` — Sprint burndown charts
- `/done` — Done Folder
- `/trash` — Trash Bin

---

## Planned (NOT YET BUILT)

- **Predecessors UI**: `predecessorIds[]` exists in schema but no UI yet
- **Gantt view**: depends on predecessors UI
- **Phone number / SMS OTP**: deferred; email magic link only for now
- **Saved views / custom fields**: Enterprise tier only
- **Phase 5 (Tests)**: Vitest unit tests for `localStore`, `useMigration`, `useLocalTaskStore`, `SavePrompt`
