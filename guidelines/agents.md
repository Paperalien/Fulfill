# Agents in Fulfill

## What Is an Agent?

An **agent** is any autonomous process, tool, or LLM-backed assistant that:
1. **Gathers context** from multiple sources before deciding what to do
2. **Applies conditional logic** — the right action depends on what was found
3. **Takes consequential action** — creates, mutates, reports, or notifies

The hallmark question: *"Would a developer need to read several things, make a judgment call, and then act?"* If yes → agent. If no → plain function or SQL query.

### The Three Archetypes Used Here

| Archetype | What it does | Trigger |
|---|---|---|
| **Autonomous worker** | Runs on a schedule; acts without being asked | Server startup + interval |
| **Developer tool** | Reads source/schema files; compares and reports drift | Run manually or in CI |
| **LLM-backed assistant** | Given a goal in natural language, uses tools to reason and act | User input (future) |

---

## Implemented Agents

### Agent 1 — Recurrence Task Spawner ✓

**Archetype:** Autonomous worker (event-driven, inline)
**Trigger:** A task with a `recurrence` field is moved to any column with `semanticStatus = 'done'`
**Policy:** `recurrence: 'daily' | 'weekly' | 'monthly'` — spawn a copy of the task in the first `not-started` column with the next due date calculated.

**Implementation:**

| Layer | File | Notes |
|---|---|---|
| Server | `artifacts/api-server/src/routes/tasks.ts` (PATCH handler) | Spawns inline on completion; handles all authenticated users |
| Client | `artifacts/pm-app/src/app/hooks/useLocalTaskStore.ts` (`updateTask`) | Mirrors server logic for unauthenticated local mode |

**Logic summary:**
1. Detect column change → new column has `semanticStatus === 'done'`
2. Check `task.recurrence` is set
3. Find first column with `semanticStatus === 'not-started'` (by `order`)
4. Create a copy: same title/tags/story points/sprint, cleared `archivedAt`/`deletedAt`/`inProgressAt`, next due date via `computeNextDueDate()`

**Tests:** `artifacts/pm-app/src/app/hooks/useLocalTaskStore.test.ts` — "updateTask / recurrence spawning" describe block (5 tests)

---

### Agent 5 — Trash Purge ✓

**Archetype:** Autonomous worker (scheduled background job)
**Trigger:** 5 seconds after server startup, then every 24 hours
**Policy:** Tasks with `deletedAt < NOW() - 30 days` are permanently hard-deleted across all workspaces.

**Implementation:**

| File | Role |
|---|---|
| `artifacts/api-server/src/agents/trashPurge.ts` | Core logic: `purgeExpiredTrash()` + `trashCutoffDate()` (pure, testable) |
| `artifacts/api-server/src/agents/scheduler.ts` | `startScheduler()` wires up `setTimeout` + `setInterval` |
| `artifacts/api-server/src/index.ts` | Calls `startScheduler()` after `app.listen()` succeeds |

**Tests:** `artifacts/api-server/src/agents/trashPurge.test.ts` — tests for cutoff date calculation and purge behavior (5 tests, DB mocked)

---

### Agent A — OpenAPI Drift Detector ✓

**Archetype:** Developer tool (static analysis)
**Trigger:** Manual run or CI step
**Command:** `pnpm check:drift`

**What it checks:**
- Endpoints in `lib/api-spec/openapi.yaml` that have no Express implementation → **Error** (exit 1)
- Routes in `artifacts/api-server/src/routes/` not listed in the spec → **Warning**

**Implementation:**

| File | Role |
|---|---|
| `scripts/src/check-api-drift.ts` | Three pure functions: `parseSpecEndpoints`, `parseRouterFile`, `diffEndpoints` + `main()` runner |

**Tests:** `scripts/src/check-api-drift.test.ts` — unit tests for all exported functions using inline fixtures (15 tests)

**When to run:** Before merging any branch that adds/removes/renames API routes. Add to CI `pnpm check:drift`.

---

### Agent B — Schema Safety Checker ✓

**Archetype:** Developer tool (static analysis, no DB connection required)
**Trigger:** Manual run before `pnpm db-push`
**Command:** `pnpm check:schema`

**What it checks (against `lib/db/drizzle/meta/0000_snapshot.json`):**
- Tables in the snapshot that no longer exist in TypeScript → **Error** (data loss)
- Columns in the snapshot that no longer exist in TypeScript → **Error** (data loss)
- New columns that are `NOT NULL` without a `DEFAULT` → **Error** (would break INSERT on existing rows)

**Implementation:**

| File | Role |
|---|---|
| `scripts/src/check-schema-safety.ts` | Three pure functions: `parseSnapshotColumns`, `parseSchemaSource`, `diffSchema` + `main()` runner |

**Tests:** `scripts/src/check-schema-safety.test.ts` — unit tests for all exported functions using inline fixtures (15 tests)

**When to run:** Always before running `pnpm db-push`. Add to CI. If the checker exits 1, review the changes before applying.

> **Note:** The snapshot file (`0000_snapshot.json`) reflects the last `drizzle-kit push`. After a successful push, re-run `pnpm db-push` once to update the snapshot, or accept that the checker will re-flag already-applied changes until the snapshot is refreshed.

---

## Future Agent Candidates

These are not yet implemented but represent high-value opportunities:

### Sprint Planning Advisor
**Archetype:** Advisor (LLM-backed)
**What it does:** Reads open backlog tasks (story points, predecessorIds), velocity history from `sprint_snapshots`, and active sprint capacity → suggests which tasks to pull into the next sprint.
**Value:** Requires reasoning across 3 data sources + dependency graph analysis — genuinely agentic.

### Task Decomposer
**Archetype:** Tool-augmented LLM assistant
**What it does:** Accepts a high-level task title → reads project context (current columns, recent tags, sprint conventions) → returns 5-10 subtasks with story point estimates.
**Value:** LLM grounded in project conventions, not generic output.

### Dependency Analyzer
**Archetype:** Advisor (algorithmic)
**What it does:** Loads all tasks with `predecessorIds` → builds directed acyclic graph → detects cycles, finds critical path → surfaces "these 3 tasks are blocking 12 others".
**Note:** The `predecessorIds` field exists in the data model but has no UI yet. This agent would provide value before the UI is built.

### Natural Language Task Capture
**Archetype:** Tool-augmented LLM assistant
**What it does:** Accepts free text like "Fix auth bug by Friday, 3 points" → parses date (resolves to absolute YYYY-MM-DD), story points, tags, sprint → returns a structured `CreateTaskPayload` for the user to confirm.
