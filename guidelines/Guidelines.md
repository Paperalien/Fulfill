# Project Management App – Development Guidelines

## Data Model Updates

Whenever `src/app/types/task.ts` changes, **both** of the following must be updated in the same response:
- `src/app/utils/seedData.ts`
- `src/app/utils/storage.ts`

### Seed Data Rules

- All fields defined in `Task` and `Sprint` must appear in at least one seed record.
- Optional fields (e.g. `storyPoints`, `dueDate`, `archivedAt`, `deletedAt`, `inProgressAt`, `sprintId`) must be present in some records and absent in others.
- Seed tasks must cover all views: active tasks, archived tasks (Done folder), and deleted tasks (Trash).
- There must be at least one task per sprint and tasks without a sprint (backlog).

### SEED_VERSION

- **SEED_VERSION must be bumped** whenever `SEED_TASKS` or `SEED_SPRINTS` change.
- Bumping the version **wipes and reseeds** all localStorage data.
- Warn the user before bumping if they have local data they care about.
- Current version: `v3` (defined in `seedData.ts`)

## Architecture

- All task state lives in `TaskContext` (single source of truth).
- Persistence is via `localStorage` only — no backend or database.
- Views share the same task data; state changes sync instantly across all views.
- `react-router` (not `react-router-dom`) is used for routing.

## Search & Filter

- `SearchBar` component accepts `SearchState` (field + value + dateOperator).
- Each view owns its own search state — it is not shared or persisted across reloads.
- Date operators: `eq` (on), `gt` (after), `lt` (before), `gte` (on or after), `lte` (on or before).

## Keyboard Shortcuts

- `/` → focus search input (capture phase, swallow key)
- `Cmd-F` (Mac) / `Ctrl-F` → focus search input (override browser default)
- `Escape` → clear search if populated, blur if empty

## Drag-and-Drop (Kanban)

- Uses `@hello-pangea/dnd`.
- Moving a task to "In Progress" column automatically sets `inProgressAt` timestamp.
- Status changes sync to TaskContext immediately.

## Story Points (Fibonacci)

- Valid values: 1, 2, 3, 5, 8, 13, 21
- Set via Planning Poker view or inline task editing.

## Trash Retention

- Deleted tasks are retained for 30 days (based on `deletedAt` timestamp).
- After 30 days, they are filtered out of the Trash view (not permanently deleted from localStorage).
- Use `resetToSeed()` from `storage.ts` to manually reset all data.
