# Fulfill — Features & Design Brief for Reviewers

**Audience:** Senior / Principal software engineers and UI/UX designers conducting an independent architecture, code, UI, and UX review.

**Purpose:** This document gives reviewers everything they need to evaluate correctness, quality, and intent alignment without access to the codebase. It covers: what the product is supposed to do, the explicit design decisions behind it, the intended UX flows (including edge cases), the technical architecture, and the format for returning review findings.

See `guidelines/Guidelines.md` for the full data model, storage layer, and file structure. See `guidelines/Guidelines.md#UML-Diagrams` for sequence diagrams and state machines covering the auth and sync flows.

---

## 1. Product Overview

**Fulfill** is a personal project-management tool for individuals and small teams. The primary persona is a solo developer or small engineering team that wants lightweight sprint tracking, kanban, and task management without Jira's complexity or forced workflows.

**Core product bets:**
- No workflow enforcement. Tasks can move freely between any columns at any time. The app stores *where* a task is (column, semantic status) but never prevents movement.
- Local-first, account-optional. The app is fully functional without sign-in. Browser `localStorage` is the initial store; an account upgrades to a synced server store. The transition must be invisible and lossless.
- Lightweight metadata. Tasks carry story points, due dates, tags, reminders, recurrence, dependencies, and subtasks — but these are all optional. The default experience is a simple list.

**Planned tiers (not yet enforced in the UI):**
- Free: tasks, subtasks, tags, kanban, done folder, trash
- Team (~$5/user): sprints, planning poker, predecessor chains, charts
- Enterprise: Gantt, saved views, custom fields

---

## 2. Application Structure

The app is a React 19 SPA (Vite) backed by an Express 5 REST API. All routes are client-side; there is no server-side rendering.

### Navigation (Sidebar)

Seven top-level destinations. The sidebar is always visible; no nested navigation.

| Route | Feature | Badge |
|---|---|---|
| `/` | To-Do List | — |
| `/kanban` | Kanban Board | — |
| `/sprints` | Sprint Management | — |
| `/planning-poker` | Planning Poker | — |
| `/charts` | Sprint Charts | — |
| `/done` | Done Folder | Archived task count |
| `/trash` | Trash Bin | Deleted task count |

When the user is **not signed in**, a **Save your data** (envelope) icon is pinned to the top of the sidebar. This is the sole entry point for account creation and sign-in.

---

## 3. Feature Descriptions

### 3.1 To-Do List (`/`)

**What it is:** A flat, unfiltered list of all active tasks (not archived, not deleted). The simplest possible view — no columns, no sprint grouping.

**Intended UX:**
- Immediate task entry via a single text input at the top. Press Enter to create.
- Inline editing: clicking any field on a task row edits it in place (title, notes, story points, due date, tags, reminder, recurrence).
- Checkbox marks a task done — this moves the task to the column with `semanticStatus: 'done'` (first such column by order). The task then disappears from the list and becomes eligible for archiving.
- Subtask expansion: a chevron reveals child tasks. Each subtask has its own checkbox. Progress shown as `n/total` on the parent.
- The list is not paginated. All tasks load at once.

**Design intent reviewers should evaluate:**
- Should feel like a notes app, not a project tracker. Low friction is the goal.
- Inline editing should not require a separate modal. Any field should be editable without navigating away.
- There is no "sort" or "filter" control on this page by design — it's a raw dump of active tasks. Reviewers should flag if the UX makes the list feel unmanageable at scale.

---

### 3.2 Kanban Board (`/kanban`)

**What it is:** A horizontal column layout with drag-and-drop task cards.

**Intended UX:**

*Task interactions:*
- Drag a task card to any column to change its status. No restrictions on which columns are valid targets.
- Click a card to open the full `TaskEditModal` (all metadata editable).
- Cards display: title, notes preview, story points, due date, tags, reminder indicator, recurrence indicator, subtask count badge, in-progress badge.

*Column management (this is a key differentiator from Jira):*
- Columns are user-configurable: add, rename, reorder (drag), delete, change color, change semantic status.
- **Semantic status** (`not-started` | `in-progress` | `done`) is separate from the column name. A column named "In QA" can have semantic status `in-progress`.
- Multiple columns can share a semantic status. A team can have "In Progress" and "In Review" both marked `in-progress`.
- Deleting a column prompts the user to choose a reassignment target for that column's tasks.
- **No transition rules, ever.** This is an explicit product decision. The app must not enforce, suggest, or block any column-to-column move.

*In-progress tracking:*
- When a task enters a column with `semanticStatus: 'in-progress'`, `inProgressAt` timestamp is set automatically.
- When a task leaves an `in-progress` column, `inProgressAt` is cleared.
- This happens client-side in both the local and API store hooks — reviewers should verify the two implementations are consistent.

**Design intent reviewers should evaluate:**
- Column drag/drop should feel smooth and not conflict with task drag/drop.
- The column management UI should be discoverable but not intrusive.
- Deleting a column must never silently orphan tasks.

---

### 3.3 Sprint Management (`/sprints`)

**What it is:** Create and manage time-boxed sprints; assign tasks to sprints.

**Intended UX:**
- Sprints are listed vertically. Each sprint shows its date range, active status, and the tasks assigned to it.
- A "Backlog" section at the top (or bottom, reviewers should check) shows tasks not assigned to any sprint.
- Create a sprint with name + start date + end date.
- Activate a sprint by toggling its `isActive` flag. **Current behavior: activating a sprint deactivates all others** (single-active enforced by `handleActivate` in `SprintManagement.tsx`). The data model supports multiple active sprints; this constraint will be removed once the multi-sprint feature design is finalized.
- Assign a task to a sprint via the task's Sprint field in the edit modal, or inline drag (if implemented).
- Deleting a sprint moves its tasks to Backlog (sets `sprintId` to null).

**Design intent reviewers should evaluate:**
- Sprint creation should be low-friction (date pickers, not text inputs for dates if possible).
- Tasks should be assignable to a sprint without leaving the sprint page.
- The backlog should make it obvious which tasks are unplanned.

---

### 3.4 Planning Poker (`/planning-poker`)

**What it is:** A single-player Fibonacci estimation tool. (Multi-player estimation is not in scope.)

**Intended UX:**
1. Dropdown to select any unestimated (or any) task.
2. Seven Fibonacci cards displayed: 1, 2, 3, 5, 8, 13, 21.
3. Clicking a card immediately sets `storyPoints` on the selected task and gives visual feedback (card highlight, toast, or similar).
4. No separate "submit" step.

**Design intent reviewers should evaluate:**
- This is intentionally minimal. The UI should take less than 10 seconds to learn.
- Card click feedback must be unambiguous — the user should never wonder if their vote registered.

---

### 3.5 Charts (`/charts`)

**What it is:** Read-only sprint analytics. No editing from this page.

**Four charts:**

| Chart | Data source | What it shows |
|---|---|---|
| Burndown | `sprint_snapshots` (daily) | Story points remaining and done over the sprint timeline |
| Velocity | `sprint_snapshots` aggregated | Completed story points per sprint (bar chart, all sprints) |
| Status distribution | Live task query | Pie chart: tasks by semantic status |
| Points by task | Live task query | Story points per task (bar chart) |

**Sprint snapshot mechanism:**
- Once per page-load (not per day), the frontend upserts a snapshot for each active sprint: `{ date: today, total: sum(storyPoints), done: sum(storyPoints where semanticStatus='done' or archivedAt set) }`.
- The `(sprintId, date)` pair has a unique constraint — repeated upserts on the same day are idempotent.
- This is a client-initiated write, not a background job. If the user never opens `/charts`, no snapshots are recorded.

**Design intent reviewers should evaluate:**
- Burndown gaps (days with no snapshot) should degrade gracefully (interpolation or visible gap — pick one and be consistent).
- The velocity chart should be immediately readable without a legend.
- Sprint filter should default to the active sprint.

---

### 3.6 Done Folder (`/done`)

**What it is:** A searchable archive of completed tasks.

**Semantics:**
- A task enters the Done Folder when `archivedAt` is set and `deletedAt` is null.
- `archiveDoneTasks()` bulk-archives all tasks currently in `done`-semantic-status columns.
- Individual tasks can also be manually archived.
- Archived tasks are **not** shown in To-Do List, Kanban, or Sprint views.

**Intended UX:**
- List with full-text search and filter (same filter system as other pages).
- Each row has an "Unarchive" button that returns the task to its column.
- No editing from this page — read/restore only.

---

### 3.7 Trash Bin (`/trash`)

**What it is:** Soft-delete recovery with 30-day retention.

**Semantics:**
- Deleting a task sets `deletedAt`. The task is hidden from all active views but remains in the database.
- After 30 days, tasks should be permanently purged (background job — not yet implemented; this is a known gap).

**Intended UX:**
- List with search/filter.
- "Restore" returns `deletedAt` to null and the task to its column.
- "Delete forever" permanently removes the row.

---

## 4. Auth & Account System

This is the most complex user flow in the app and the highest-risk area for edge cases.

### 4.1 Design Principles

- **No auth gate.** The app renders immediately. There is no `/login` page, no redirect, no loading spinner waiting for auth resolution.
- **`isAuthenticated`** = `!!session && !!workspaceId`. Both must be present before switching TaskContext to API mode. Using `!!session` alone causes one bad render with `workspaceId = null`, breaking all API calls.
- **`loading`** resolves when `getSession()` returns — it does **not** wait for `ensurePersonalWorkspace()`. The workspace lookup is a separate async operation.

### 4.2 Auth States

| State | session | workspaceId | isAuthenticated | TaskContext backend |
|---|---|---|---|---|
| Initial (resolving) | null | null | false | localStorage |
| Unauthenticated | null | null | false | localStorage |
| Session only (workspace pending) | set | null | false | localStorage |
| Fully authenticated | set | set | true | API |

### 4.3 SavePrompt Flow (First-Run and Returning)

The SavePrompt is a popover (not a page). It has four panels:

```
[choice]
  "Want to save your data across devices?"
  ├─ "Yes, set me up"  →  [email]
  └─ "Not now"         →  close + toast("You can save anytime via the icon ↖")
                          + markFirstRunSeen()

[email]
  Email input + submit
  ├─ POST /api/users/check-email
  │    ├─ hasData: false  →  signInWithEmail()  →  [sent]
  │    └─ hasData: true   →  [merge-confirm]
  └─ Back button          →  [choice]

[merge-confirm]
  "You already have saved data on this account."
  "Your local data will be merged in. Nothing will be deleted."
  ├─ "Merge & continue"  →  signInWithEmail()  →  [sent]
  └─ "Cancel"            →  [email]

[sent]
  "Check your inbox!"
  "We sent a magic link to [email]."
  (no further action needed from the user in this panel)
```

**Auto-open logic:** On mount, `AuthArea` checks `!isAuthenticated && !hasSeenFirstRun()`. If true, the popover opens automatically once. Re-opening via the icon always opens to `[choice]`.

**The merge-confirm panel is critical UX.** Reviewers should verify: (a) it only appears when the user has local data AND the email already has server data, (b) the language is accurate about what will happen, and (c) cancelling truly prevents the OTP from being sent.

### 4.4 Migration Flow (localStorage → Server)

Triggered by `useMigration()` hook inside `MigrationBoundary` in `App.tsx`, whenever:
`isAuthenticated && workspaceId && hasLocalData() && !alreadyTriggered`

**Steps:**
1. Dispatch `fulfill:flush-edits` custom event → `TaskEditModal` auto-saves any unsaved changes to `localStorage`.
2. Read all local data: `readColumns()`, `readSprints()`, `readTasks()`.
3. `POST /api/workspaces/{workspaceId}/migrate` with `{ columns, sprints, tasks }` (60-second timeout via `AbortController`).
4. Server executes in a single database transaction:
   - Columns: deduplicated by `name + semanticStatus` against existing server columns. Matched columns reuse the server ID; new columns are appended. Builds `colIdMap`.
   - Sprints: always created fresh (no dedup). Builds `sprintIdMap`.
   - Tasks: new UUIDs pre-assigned. References remapped: `columnId` via `colIdMap`, `sprintId` via `sprintIdMap`, `parentId` via `taskIdMap`, `predecessorIds[]` via `taskIdMap` (missing references dropped, not errored).
5. On success: `clearLocalData()` + `queryClient.invalidateQueries()` (all queries).
6. On failure: localStorage untouched; `MigrationOverlay` enters `error` state; Retry button re-triggers from step 1.

**`MigrationOverlay` states:**
- `migrating` — full-screen backdrop blur, animated spinner, "Saving your data…", no user interaction possible.
- `error` — same overlay, error message, Retry button.
- `idle` — overlay not rendered.

**Edge cases explicitly handled in the migration endpoint:**
- Local column references a column that was already on the server → reuses server ID, no duplicate.
- Task references a parent that is also being migrated → remapped to new server ID correctly.
- Task references a predecessor that doesn't exist locally → dropped from the array silently.
- Sprint references during task upload → remapped; null if sprint wasn't in the batch (shouldn't happen in practice).

**Edge cases NOT handled (known gaps reviewers should note):**
- Migration is triggered once per auth event. If the user closes the tab mid-migration and re-opens, the overlay won't reappear because `hasLocalData()` may partially reflect the failed state. (Mitigation: localStorage is only cleared on confirmed server success.)
- Concurrent device use during migration window (rare; one personal workspace, one magic link click).
- Very large localStorage datasets approaching the 2MB API body limit (`app.ts` sets `express.json({ limit: '2mb' })`).

---

## 5. Task Data Model (Reviewer Reference)

Full schema is in `guidelines/Guidelines.md`. This is the subset reviewers most often need to evaluate UI/UX correctness:

| Field | Type | Semantics |
|---|---|---|
| `columnId` | string (FK) | Current kanban column. All tasks must have a column. |
| `semanticStatus` | derived | Read from the task's column — never stored on the task itself. |
| `inProgressAt` | timestamp? | Set on entry to `in-progress` column; cleared on exit. |
| `archivedAt` | timestamp? | Non-null = Done Folder. Mutually exclusive with active views. |
| `deletedAt` | timestamp? | Non-null = Trash. Soft delete. |
| `parentId` | string? | One parent task. Not a DB FK — orphan protection is app-level. |
| `predecessorIds` | string[]? | Blocking tasks. Data exists; **no UI yet**. |
| `reminder` | string? | `'day-before'` \| `'on-due-date'` \| `'YYYY-MM-DD'` |
| `recurrence` | string? | `'daily'` \| `'weekly'` \| `'monthly'` |

**Active vs. archived vs. deleted — the filtering rules:**
- Active: `deletedAt == null && archivedAt == null`
- Done Folder: `archivedAt != null && deletedAt == null`
- Trash: `deletedAt != null`
- A task can be in Trash without being archived first (direct delete).
- A task should not have both `archivedAt` and `deletedAt` set simultaneously; the app does not currently enforce this constraint at the DB level.

---

## 6. Known Gaps and Deferred Work

These are intentional omissions, not bugs. Reviewers should note them as gaps but not raise them as defects unless the existing UI misleads users about them.

| Area | Status |
|---|---|
| Predecessors UI | Data model and API exist; no UI. The field is set/cleared only via API directly. |
| 30-day Trash purge | Retention policy exists in the data model; no background job yet. |
| SMS / phone sign-in | Deferred; email magic link only. |
| Multi-user / team workspaces | One personal workspace per account. No sharing, no roles. |
| Gantt view | Planned for Enterprise tier; not started. |
| Saved views / custom fields | Planned for Enterprise; not started. |
| Offline support beyond localStorage | No service worker; tab must be open for local data to persist. |

---

## 7. Review Communication Format

Return findings as a structured Markdown document placed in `guidelines/reviews/`. See `guidelines/tips-for-reviewers.md` for guidance on how to write findings that Claude Code can act on accurately.

---

### File and location conventions

| What you're referencing | Format to use |
|---|---|
| A file | `artifacts/pm-app/src/app/hooks/useMigration.ts` |
| A file + line range | `artifacts/pm-app/src/app/hooks/useMigration.ts:47–63` |
| A React component | `MigrationOverlay` in `artifacts/pm-app/src/app/components/MigrationOverlay.tsx` |
| A function or hook | `useMigration()` in `artifacts/pm-app/src/app/hooks/useMigration.ts` |
| An API route | `POST /workspaces/:id/migrate` in `artifacts/api-server/src/routes/migrate.ts` |
| A generated file (do not edit) | Note: `lib/api-zod/src/generated/` and `lib/api-client-react/src/generated/` — changes must go in `lib/api-spec/openapi.yaml` instead |

---

### Finding template

````markdown
### [F-NNN] Short imperative title (e.g., "Fix race condition in workspace resolution")

| Field | Value |
|---|---|
| **Severity** | Critical · High · Medium · Low · Advisory |
| **Category** | Architecture · Code · UI · UX · Security · Performance · Accessibility |
| **Location** | exact file path, function name, and line range if known |
| **Depends on** | F-NNN (if this finding must be addressed after another) |

**Observed:**
Precise description of what the code does or what the UI shows.
Quote the relevant code if the issue is subtle:
```ts
// useMigration.ts:34 — triggers on every render, not just on auth change
useEffect(() => {
  if (isAuthenticated && hasLocalData()) runMigration();
});
```

**Expected:**
What should happen instead, grounded in either the design brief or established best practice.
If this contradicts a stated design decision in the brief, say so explicitly and argue why.

**Recommended fix:**
Direction, pseudocode, or a concrete diff. If you don't know the fix, write "Unknown — flag for developer decision" rather than leaving this blank.

**If left unfixed:**
The concrete failure mode. What breaks, under what conditions, for which user.
````

---

### Severity definitions

| Level | Meaning | Implementation priority |
|---|---|---|
| **Critical** | Data loss, security vulnerability, or complete feature failure. | Fix before anything else. |
| **High** | Feature produces wrong output, incorrect state, or creates significant user confusion. | Fix in the same session as Critical. |
| **Medium** | Noticeable degradation that does not break the primary flow. | Fix in the next session. |
| **Low** | Polish, edge case with very low probability, or minor inconsistency. | Fix opportunistically. |
| **Advisory** | No action required. Documents a trade-off, a future risk, or a question for the developer. | Read and decide; no code change expected. |

---

### Category definitions

| Category | What to evaluate |
|---|---|
| **Architecture** | Data flow, coupling, separation of concerns, scalability under realistic load, resilience to partial failure |
| **Code** | Correctness, error handling, edge cases in control flow, hook dependency arrays, TypeScript type safety, test coverage gaps |
| **UI** | Visual correctness — layout, spacing, typography, color, component states (empty, loading, error, populated) |
| **UX** | User flows, discoverability, feedback timing and clarity, error recovery paths, mental model alignment |
| **Security** | Auth/authz enforcement, input validation, token handling, what is stored in localStorage and its sensitivity |
| **Performance** | Unnecessary re-renders, unindexed queries, waterfall fetches that could be parallel, perceived latency |
| **Accessibility** | Keyboard navigation, focus management, screen reader labelling, color contrast ratios |

---

### File naming and delivery

```
guidelines/reviews/review-[reviewer-id]-[YYYY-MM-DD].md
```

Create `guidelines/reviews/` if it doesn't exist. One file per review session. If the same reviewer submits a follow-up after fixes are applied, use a new date-stamped file rather than editing the original — the original serves as a record of what was found before fixes were applied.

If the review includes screenshots (strongly recommended for UI/UX findings), place them in `guidelines/reviews/assets/[reviewer-id]-[YYYY-MM-DD]-[F-NNN].png`.

