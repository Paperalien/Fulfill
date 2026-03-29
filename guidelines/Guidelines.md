# Project Manager — Data Model & Architecture Guidelines

## Product Principles
- **No state machines, no transition rules.** Columns are free-move buckets. Any task can move to any column at any time. This is an explicit design decision to avoid the Jira anti-pattern.
- **Simple but powerful:** 80/20 rule — build what genuinely helps small teams without enterprise complexity.
- **Product tiers:** Free (current feature set + subtasks + tags) | Team ($5/user; sprints, planning poker, predecessors) | Enterprise (Gantt, saved views, custom fields — future).

---

## Data Model (SEED_VERSION: v4)

### KanbanColumn
```typescript
{
  id: string;             // Unique column identifier
  name: string;           // Display name (e.g. "In Review")
  order: number;          // Sort position (0-indexed)
  semanticStatus:         // Semantic grouping used by all views
    'not-started' | 'in-progress' | 'done';
  color?: string;         // UI color: gray, blue, purple, green, orange, red, yellow
}
```

### Task
```typescript
{
  id: string;
  title: string;
  description: string;
  columnId: string;           // Which kanban column this task is in (replaces old status enum)
  storyPoints?: number;       // Fibonacci: 1, 2, 3, 5, 8, 13, 21
  createdAt: string;          // ISO timestamp
  updatedAt: string;          // ISO timestamp
  sprintId?: string;
  order: number;
  archivedAt?: string;        // Set when moved to Done folder
  deletedAt?: string;         // Set when soft-deleted to Trash (30-day retention)
  dueDate?: string;           // YYYY-MM-DD
  inProgressAt?: string;      // Set when moved into an in-progress column; cleared when moved out
  parentId?: string;          // Single parent task (subtask tree — no named hierarchy levels)
  predecessorIds?: string[];  // Tasks that must complete before this one (for Gantt later)
  tags?: string[];            // Many-to-many labels
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
- Old model: `status: 'todo' | 'in-progress' | 'done'` (hardcoded, removed in v4)
- New model: `columnId` pointing to a `KanbanColumn`, which has a `semanticStatus`
- Helper: `getSemanticStatus(task, columns): SemanticStatus`
- All views (To-Do, Sprint, Done folder) use `semanticStatus` for filtering, not the column name

### inProgressAt behavior
- **Set** when a task moves INTO a column with `semanticStatus === 'in-progress'`
- **Cleared** (set to undefined) when a task moves OUT of an in-progress column
- Badge is only shown in views when `semanticStatus === 'in-progress'`

### Subtasks via parentId
- `parentId?: string` — single parent, unlimited depth
- No named hierarchy levels (no "Epic", "Feature", "Story" types) — just tasks with tasks
- Subtask progress: count children with `semanticStatus === 'done'`
- TodoList and SprintManagement show subtasks inline (expandable)
- Kanban shows subtask count badge

### Tags
- `tags: string[]` — lowercase, hyphenated (e.g. "backend", "in-review")
- Many-to-many: one task can have many tags, one tag can appear on many tasks
- Tags replace the concept of "lists" — they're labels, not containers
- Search field "Tags" filters by tag value

### Configurable Kanban Columns
- Columns are ordered named buckets with an optional `semanticStatus`
- Add, rename, reorder (up/down arrows), delete columns from the "Columns" button in Kanban
- Deleting a column reassigns its tasks to another column (user picks fallback)
- Multiple columns can share the same `semanticStatus` (e.g. "In Review" and "In Progress" both map to `in-progress`)
- **No transition rules. Ever.**

### Archive vs Delete
- **Archive** (`archivedAt`): moves tasks to Done Folder. Done folder shows `archivedAt && !deletedAt`
- **Delete** (`deletedAt`): moves tasks to Trash. Permanently removed after 30 days.
- `archiveDoneTasks()`: archives all tasks in columns with `semanticStatus === 'done'`

---

## SEED_VERSION Rules
- **Current: v4**
- Bumping SEED_VERSION wipes all user localStorage data and reseeds from `SEED_TASKS` / `SEED_SPRINTS` / `SEED_COLUMNS`
- **Always warn the user** before bumping SEED_VERSION if they have live data
- Bump when: column or task schema changes, new required fields added

---

## File Structure
```
src/app/
  types/task.ts              # All types: Task, Sprint, KanbanColumn, SemanticStatus, SearchState
  contexts/TaskContext.tsx   # Global state: tasks, sprints, columns + CRUD operations
  utils/
    storage.ts               # localStorage: getTasks/saveTasks, getSprints/saveSprints, getColumns/saveColumns
    seedData.ts              # SEED_VERSION, SEED_TASKS, SEED_SPRINTS, SEED_COLUMNS
    taskUtils.ts             # getSemanticStatus, getSubtasks, formatInProgressSince, getColumnColor
    searchUtils.ts           # filterTasks(tasks, columns, field, value, dateOperator)
    sortUtils.ts             # sortTasksByField(tasks, columns, field, order)
  components/
    Layout.tsx               # Sidebar nav, "N in progress" indicator (default export)
    SearchBar.tsx            # Multi-field search + sort (named export: { SearchBar })
    TaskFields.tsx           # Story points + due date inputs (default export)
    TagInput.tsx             # Tag editing component (named exports: { TagInput, TagBadge })
    InProgressBadge.tsx      # Pulsing "In Progress · 5d ago" badge (named: { InProgressBadge })
  pages/
    TodoList.tsx             # Expandable subtasks, tags, in-progress badge
    KanbanBoard.tsx          # Dynamic columns, column manager, drag-and-drop
    SprintManagement.tsx     # Sprint CRUD, active sprint stats, in-progress badge
    PlanningPoker.tsx        # Fibonacci voting
    DoneFolder.tsx           # Archived tasks
    TrashBin.tsx             # Soft-deleted tasks (30-day retention)
```

---

## Route Paths
- `/` — To-Do List
- `/kanban` — Kanban Board
- `/sprints` — Sprint Management
- `/planning-poker` — Planning Poker
- `/done` — Done Folder
- `/trash` — Trash Bin

---

## Planned (NOT YET BUILT)
- **Predecessors UI**: `predecessorIds[]` field exists in schema but no UI yet
- **Gantt view**: depends on predecessors UI
- **Saved views / custom fields**: Enterprise tier only
