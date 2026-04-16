# Fulfill Comprehensive Review

Review scope: architecture, code, UI, UX, security, performance, accessibility, and third-party/external integrations (Supabase auth, OpenAPI/Orval, React Query, Drizzle/Postgres, browser localStorage).

---

### [F-001] Enforce workspace authorization on all workspace-scoped routes

| Field | Value |
|---|---|
| **Severity** | Critical |
| **Category** | Security |
| **Location** | `artifacts/api-server/src/routes/index.ts` (`router.use("/workspaces/:workspaceId/...")`), all handlers under `artifacts/api-server/src/routes/{tasks,sprints,columns,sprint-snapshots,migrate}.ts` |
| **Depends on** | — |

**Observed:**
Routes require authentication globally, but they trust `req.params.workspaceId` and do not verify the authenticated user owns or belongs to that workspace before reads/writes.

```ts
// artifacts/api-server/src/routes/index.ts
router.use(requireAuth);
router.use("/workspaces/:workspaceId/tasks", tasksRouter);
router.use("/workspaces/:workspaceId/sprints", sprintsRouter);
router.use("/workspaces/:workspaceId/columns", columnsRouter);
```

**Expected:**
Every workspace-scoped request should authorize access to that specific workspace (owner or membership check) before business logic executes.

**Recommended fix:**
Add a workspace authorization middleware mounted once at `/workspaces/:workspaceId/*` that loads workspace and enforces `workspace.ownerId === req.user.id` (or membership when teams are added). Return `403` on mismatch and short-circuit route handlers.

**If left unfixed:**
An authenticated user can potentially access or mutate another user’s workspace by guessing or obtaining workspace IDs, resulting in cross-tenant data exposure and tampering.

---

### [F-002] Align delete-task behavior with soft-delete contract

| Field | Value |
|---|---|
| **Severity** | High |
| **Category** | Code |
| **Location** | `DELETE /workspaces/{workspaceId}/tasks/{taskId}` in `artifacts/api-server/src/routes/tasks.ts`; contract in `lib/api-spec/openapi.yaml` |
| **Depends on** | — |

**Observed:**
The API spec describes delete as soft-delete via `deletedAt`, but runtime implementation performs hard delete.

```ts
// artifacts/api-server/src/routes/tasks.ts
// DELETE /:taskId — hard delete
await db
  .delete(tasksTable)
  .where(and(eq(tasksTable.id, taskId), eq(tasksTable.workspaceId, workspaceId)));
```

**Expected:**
Delete should set `deletedAt` (and `updatedAt`) so trash/recovery semantics remain intact.

**Recommended fix:**
Replace physical delete with update:
- `deletedAt = now`
- `updatedAt = now`
- keep `204` response.
Reserve hard delete for explicit permanent-delete endpoint only.

**If left unfixed:**
Users lose data permanently despite product promise of trash retention and recoverability.

---

### [F-003] Resolve `ensure-personal` API contract drift

| Field | Value |
|---|---|
| **Severity** | High |
| **Category** | Architecture |
| **Location** | `lib/api-spec/openapi.yaml` (`/workspaces/ensure-personal`), `artifacts/api-server/src/routes/workspaces.ts`, `artifacts/pm-app/src/app/contexts/AuthContext.tsx` |
| **Depends on** | — |

**Observed:**
Spec defines `200` response with full `Workspace`, but backend returns `{ workspaceId }` and may return `201` on create. Frontend compensates with fallback parsing.

```ts
// artifacts/pm-app/src/app/contexts/AuthContext.tsx
const data = await response.json();
setWorkspaceId(data.workspaceId ?? data.id ?? null);
```

**Expected:**
Spec, runtime, and generated clients should match exactly in shape and status code.

**Recommended fix:**
Pick a single contract and enforce end-to-end (prefer spec-driven full `Workspace` + `200`), regenerate clients/validators, and remove frontend fallback parsing.

**If left unfixed:**
Generated client usage remains risky, integration tests become brittle, and future refactors can silently break auth bootstrap.

---

### [F-004] Prevent email-data enumeration on public check endpoint

| Field | Value |
|---|---|
| **Severity** | High |
| **Category** | Security |
| **Location** | `POST /users/check-email` in `artifacts/api-server/src/routes/users.ts` |
| **Depends on** | — |

**Observed:**
Unauthenticated callers can probe whether an email has existing workspace data (`hasData: true/false`), creating an account intelligence oracle.

**Expected:**
Public endpoint should not leak account/data existence without abuse controls.

**Recommended fix:**
Return a generic response for public callers, and add abuse mitigations (rate limiting, bot challenge/captcha, monitoring). If preserving behavior is required for UX, gate with stronger anti-abuse controls.

**If left unfixed:**
Attackers can enumerate active accounts and target users with credential/phishing campaigns.

---

### [F-005] Restrict CORS policy to trusted origins

| Field | Value |
|---|---|
| **Severity** | High |
| **Category** | Security |
| **Location** | `artifacts/api-server/src/app.ts` (`app.use(cors())`) |
| **Depends on** | — |

**Observed:**
CORS is configured with defaults, effectively allowing all origins.

```ts
// artifacts/api-server/src/app.ts
app.use(cors());
```

**Expected:**
CORS should use explicit environment-specific allowlists.

**Recommended fix:**
Configure `cors({ origin: [...], methods: [...], allowedHeaders: [...] })` from env config and reject unknown origins in production.

**If left unfixed:**
Expanded attack surface and easier abuse from untrusted origins; weak production security posture.

---

### [F-006] Preserve email-panel context on merge-confirm cancel

| Field | Value |
|---|---|
| **Severity** | High |
| **Category** | UX |
| **Location** | `SavePrompt` in `artifacts/pm-app/src/app/components/SavePrompt.tsx` |
| **Depends on** | — |

**Observed:**
On merge-confirm panel, Cancel closes prompt and resets panel to `choice`, discarding progress.

```ts
// artifacts/pm-app/src/app/components/SavePrompt.tsx
<Button size="sm" variant="ghost" onClick={() => handleOpenChange(false)}>
  Cancel
</Button>
```

**Expected:**
Cancel should return to `[email]` panel so user can adjust email or go back intentionally without losing context.

**Recommended fix:**
Change merge-confirm Cancel to `setPanel('email')` and keep popover open. Keep close/reset only on explicit dismissal.

**If left unfixed:**
Users experience avoidable friction in a critical auth/migration decision point and may abandon account setup.

---

### [F-007] Allow multiple active sprints per product intent

| Field | Value |
|---|---|
| **Severity** | High |
| **Category** | UX |
| **Location** | `handleActivate()` in `artifacts/pm-app/src/app/pages/SprintManagement.tsx` |
| **Depends on** | — |

**Observed:**
UI force-deactivates all active sprints before activating the selected sprint.

```ts
// artifacts/pm-app/src/app/pages/SprintManagement.tsx
sprints.forEach((s) => { if (s.isActive && s.id !== sprintId) updateSprint(s.id, { isActive: false }); });
updateSprint(sprintId, { isActive: true });
```

**Expected:**
Guidelines state multiple active sprints are valid and should not be blocked by UI behavior.

**Recommended fix:**
Remove forced deactivation logic in `handleActivate`; treat each sprint toggle independently, and update copy/labels as needed.

**If left unfixed:**
Implementation contradicts documented model and constrains planning workflows unexpectedly.

---

### [F-008] Require explicit reassignment target when deleting a kanban column

| Field | Value |
|---|---|
| **Severity** | High |
| **Category** | UX |
| **Location** | `ColumnManagerModal` in `artifacts/pm-app/src/app/pages/KanbanBoard.tsx` |
| **Depends on** | — |

**Observed:**
Delete flow auto-selects the first non-deleted column as fallback, with no user selection.

```ts
const fallback = sorted.find((c) => c.id !== deleteConfirm)?.id ?? '';
deleteColumn(deleteConfirm, fallback);
```

**Expected:**
User must choose reassignment target before deleting a column.

**Recommended fix:**
Add explicit target selector in confirmation dialog; disable confirm until valid target is selected.

**If left unfixed:**
Tasks can move to unexpected columns, violating user intent and causing trust/traceability issues.

---

### [F-009] Add permanent-delete action in Trash Bin UI

| Field | Value |
|---|---|
| **Severity** | High |
| **Category** | UX |
| **Location** | `TrashBin` in `artifacts/pm-app/src/app/pages/TrashBin.tsx` |
| **Depends on** | F-002 |

**Observed:**
Trash page only offers Restore; no user-driven “Delete forever” action despite feature brief.

**Expected:**
Trash should offer both restore and permanent delete controls.

**Recommended fix:**
Add “Delete forever” action with confirmation. Implement permanent-delete API endpoint separately from soft delete path.

**If left unfixed:**
Trash behavior remains incomplete versus documented UX; users cannot intentionally clean sensitive/obsolete data.

---

### [F-010] Validate cross-workspace integrity for task/sprint references

| Field | Value |
|---|---|
| **Severity** | Medium |
| **Category** | Architecture |
| **Location** | `lib/db/src/schema/tasks.ts`, `lib/db/src/schema/sprint_snapshots.ts`, related write routes in `artifacts/api-server/src/routes/` |
| **Depends on** | F-001 |

**Observed:**
`tasks.columnId` and `tasks.sprintId` are single-column FKs. This does not enforce that referenced rows belong to the same workspace.

**Expected:**
Workspace-scoped records should be integrity-bound to same-workspace references.

**Recommended fix:**
Add composite constraints/FKs (`workspace_id + referenced_id`) where feasible and mirror with API-layer validation for clean 4xx responses.

**If left unfixed:**
Cross-workspace linkage bugs remain possible from malformed writes or future code changes.

---

### [F-011] Validate `reassignToId` belongs to same workspace and differs from source column

| Field | Value |
|---|---|
| **Severity** | Medium |
| **Category** | Code |
| **Location** | `DELETE /workspaces/{workspaceId}/columns/{columnId}` in `artifacts/api-server/src/routes/columns.ts` |
| **Depends on** | F-001 |

**Observed:**
Route validates presence/type of `reassignToId`, but does not validate target exists in workspace or differs from deleted column before DB transaction.

**Expected:**
Endpoint should return deterministic 400/404 for invalid reassignment targets.

**Recommended fix:**
Preload source + target columns in workspace; reject self-targeting, missing source, missing target, and out-of-workspace target.

**If left unfixed:**
Users receive inconsistent DB-driven errors and risk invalid reassignment behavior in edge cases.

---

### [F-012] Improve API resilience with rate limiting and consistent error boundaries

| Field | Value |
|---|---|
| **Severity** | Medium |
| **Category** | Architecture |
| **Location** | `artifacts/api-server/src/app.ts`, selected route handlers (e.g., `columns.ts`, `sprint-snapshots.ts`) |
| **Depends on** | — |

**Observed:**
No request rate limiting is configured; some handlers lack local `try/catch` and rely on default behavior, reducing observability consistency.

**Expected:**
Sensitive/public and write-heavy endpoints should have abuse controls, and route failures should be logged with clear domain context.

**Recommended fix:**
Add global + route-specific rate limiting and centralized async error handling middleware; standardize structured error logging.

**If left unfixed:**
Higher operational risk under abuse or burst traffic, and slower incident diagnosis.

---

### [F-013] Remove no-op filtering in charts data pipeline

| Field | Value |
|---|---|
| **Severity** | Low |
| **Category** | Performance |
| **Location** | `BurnCharts` in `artifacts/pm-app/src/app/pages/Charts.tsx` |
| **Depends on** | — |

**Observed:**
A filter expression effectively returns all snapshots and does not constrain data, adding noise and unnecessary iteration.

**Expected:**
Either no filter, or a meaningful filter tied to selected sprint/date.

**Recommended fix:**
Replace no-op with direct array use or explicit filter predicate with clear intent.

**If left unfixed:**
Minor perf overhead and reduced code clarity for future maintenance.

---

### [F-014] Improve accessibility labeling for icon-only controls

| Field | Value |
|---|---|
| **Severity** | Low |
| **Category** | Accessibility |
| **Location** | Icon-only buttons across `artifacts/pm-app/src/app/pages/TodoList.tsx`, `KanbanBoard.tsx`, `TaskEditModal.tsx`, `SprintManagement.tsx` |
| **Depends on** | — |

**Observed:**
Several icon-only controls rely on `title` or visual context instead of explicit accessible names.

**Expected:**
Every icon-only interactive element should include an `aria-label` and predictable keyboard behavior.

**Recommended fix:**
Add `aria-label` across icon-only buttons; verify focus states and keyboard operation in modal and board contexts.

**If left unfixed:**
Screen reader and keyboard-only users face avoidable usability barriers.

---

## Remediation order and dependencies

1. **F-001** immediately (security boundary).
2. **F-002, F-003, F-004, F-005** next (data semantics + external/system security + contract correctness).
3. **F-006 to F-009** next (high UX correctness gaps).
4. **F-010 and F-011** after F-001 (integrity hardening and safer deletion semantics).
5. **F-012 to F-014** as stability/polish hardening.

## Immediate risk mitigations (before full fixes land)

- Gate production API to trusted origins only.
- Add temporary rate limits to `/users/check-email` and all mutation routes.
- Add monitoring/alerting for suspicious access patterns on workspace-scoped endpoints.
- Pause rollout of generated-client-first refactors until `ensure-personal` contract is aligned.
