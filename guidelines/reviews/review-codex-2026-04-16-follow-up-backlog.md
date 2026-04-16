# Follow-up Implementation Backlog

Source review: `guidelines/reviews/review-codex-2026-04-16.md`

Each ticket maps 1:1 to a finding and is scoped for direct implementation.

---

## P0 — Security and Data Integrity

### T-001 — Enforce workspace authorization middleware
- **Maps to:** F-001
- **Priority:** P0
- **Scope:** Add middleware for all `/workspaces/:workspaceId/*` routes to verify authenticated user access.
- **Files:** `artifacts/api-server/src/routes/index.ts`, new middleware file under `artifacts/api-server/src/middlewares/`
- **Acceptance criteria:**
  - Requests to another user’s workspace return `403`.
  - Valid owner requests continue to succeed for tasks/sprints/columns/snapshots/migrate.
  - Authorization is centralized (not duplicated in every route).
  - Tests cover allowed and denied cases.

### T-002 — Convert task delete to soft-delete
- **Maps to:** F-002
- **Priority:** P0
- **Scope:** Replace hard delete with `deletedAt`/`updatedAt` update in task delete route.
- **Files:** `artifacts/api-server/src/routes/tasks.ts`, tests for delete behavior
- **Acceptance criteria:**
  - `DELETE /tasks/{id}` does not remove row physically.
  - Deleted task is excluded from active task queries.
  - Deleted task appears in trash workflows as expected.
  - API returns `204` unchanged.

### T-003 — Lock down CORS by environment
- **Maps to:** F-005
- **Priority:** P0
- **Scope:** Configure origin allowlist and reject untrusted origins in production.
- **Files:** `artifacts/api-server/src/app.ts`, env config/docs
- **Acceptance criteria:**
  - Production allows only configured app origins.
  - Local dev still works with configured local origins.
  - Unknown origins are blocked.

### T-004 — Protect `/users/check-email` from enumeration abuse
- **Maps to:** F-004
- **Priority:** P0
- **Scope:** Remove/obfuscate existence signal and add throttling safeguards.
- **Files:** `artifacts/api-server/src/routes/users.ts`, server middleware setup
- **Acceptance criteria:**
  - Public callers cannot trivially infer whether account/data exists.
  - Endpoint has rate limiting with sensible burst limits.
  - Logging/monitoring captures suspicious probing.

---

## P1 — Contract and Product Behavior Alignment

### T-005 — Align `ensure-personal` API contract across spec/runtime/client
- **Maps to:** F-003
- **Priority:** P1
- **Scope:** Make endpoint response and status match OpenAPI (or update spec deliberately), regenerate codegen artifacts, remove frontend fallback parsing.
- **Files:** `lib/api-spec/openapi.yaml`, `artifacts/api-server/src/routes/workspaces.ts`, `artifacts/pm-app/src/app/contexts/AuthContext.tsx`, generated libs
- **Acceptance criteria:**
  - Runtime response shape/status exactly matches spec.
  - Codegen runs cleanly and generated clients compile.
  - `AuthContext` no longer depends on dual shape fallback (`workspaceId ?? id`).
  - Contract test verifies endpoint shape and status.

### T-006 — Fix SavePrompt merge-cancel flow
- **Maps to:** F-006
- **Priority:** P1
- **Scope:** Keep dialog open and return to email panel on merge-confirm cancel.
- **Files:** `artifacts/pm-app/src/app/components/SavePrompt.tsx`, `SavePrompt.test.tsx`
- **Acceptance criteria:**
  - Cancel in merge-confirm transitions to `email` panel.
  - Entered email remains populated.
  - OTP is not sent unless user confirms merge/continue.

### T-007 — Support multiple active sprints in UI
- **Maps to:** F-007
- **Priority:** P1
- **Scope:** Remove forced deactivation on sprint activation.
- **Files:** `artifacts/pm-app/src/app/pages/SprintManagement.tsx`
- **Acceptance criteria:**
  - Activating sprint A does not deactivate sprint B.
  - UI correctly indicates multiple active sprints when present.
  - Existing sprint CRUD behavior remains intact.

### T-008 — Require explicit reassignment target in kanban column delete UX
- **Maps to:** F-008
- **Priority:** P1
- **Scope:** Add selector for reassignment target in delete dialog (no implicit default delete path).
- **Files:** `artifacts/pm-app/src/app/pages/KanbanBoard.tsx`
- **Acceptance criteria:**
  - User must select target column before confirming delete.
  - Delete disabled until valid non-source target selected.
  - Tasks reliably move to selected target.

### T-009 — Add permanent delete action in Trash
- **Maps to:** F-009
- **Priority:** P1
- **Depends on:** T-002
- **Scope:** Add explicit “Delete forever” action and confirm flow; wire endpoint semantics.
- **Files:** `artifacts/pm-app/src/app/pages/TrashBin.tsx`, task route(s)
- **Acceptance criteria:**
  - Trash rows have Restore and Delete forever.
  - Permanent delete requires confirmation.
  - Permanent delete removes row from storage and UI.

---

## P2 — Hardening and Maintainability

### T-010 — Enforce same-workspace foreign-key integrity
- **Maps to:** F-010
- **Priority:** P2
- **Depends on:** T-001
- **Scope:** Add composite integrity constraints where feasible and API-level guardrails.
- **Files:** `lib/db/src/schema/tasks.ts`, `lib/db/src/schema/sprint_snapshots.ts`, migrations, write routes
- **Acceptance criteria:**
  - Invalid cross-workspace references are rejected.
  - Migration path preserves existing valid data.
  - API returns deterministic 4xx for invalid link attempts.

### T-011 — Validate `reassignToId` for column deletion server-side
- **Maps to:** F-011
- **Priority:** P2
- **Depends on:** T-001
- **Scope:** Add source/target workspace validation and self-target rejection.
- **Files:** `artifacts/api-server/src/routes/columns.ts`
- **Acceptance criteria:**
  - Missing source or target returns clean 404/400.
  - Reassign to same column returns 400.
  - Only same-workspace targets are accepted.

### T-012 — Add global error boundary and route-tier rate limiting
- **Maps to:** F-012
- **Priority:** P2
- **Scope:** Standardize async error handling and add endpoint-class-based limits.
- **Files:** `artifacts/api-server/src/app.ts`, route wrappers/middleware
- **Acceptance criteria:**
  - Unhandled route exceptions return consistent API error envelopes.
  - Logs include route context and correlation id.
  - Rate limits apply to public and mutation-heavy routes.

---

## P3 — Polish and Accessibility

### T-013 — Remove no-op chart filtering logic
- **Maps to:** F-013
- **Priority:** P3
- **Scope:** Replace no-op filter with clear intent.
- **Files:** `artifacts/pm-app/src/app/pages/Charts.tsx`
- **Acceptance criteria:**
  - No redundant pass over snapshots.
  - Chart data logic is easy to reason about and tested where practical.

### T-014 — Add accessible labels to icon-only controls
- **Maps to:** F-014
- **Priority:** P3
- **Scope:** Add `aria-label` and verify focus/keyboard behavior for icon-only buttons.
- **Files:** `artifacts/pm-app/src/app/pages/{TodoList,KanbanBoard,SprintManagement}.tsx`, `artifacts/pm-app/src/app/components/TaskEditModal.tsx`
- **Acceptance criteria:**
  - All icon-only interactive controls expose accessible names.
  - Keyboard navigation is consistent in modals and list/board views.
  - No regression in existing interaction tests.

---

## Suggested execution order (PR slices)

1. **PR-1 (P0 core):** T-001, T-002
2. **PR-2 (P0 edge):** T-003, T-004
3. **PR-3 (contract + auth UX):** T-005, T-006
4. **PR-4 (planning UX):** T-007, T-008, T-009
5. **PR-5 (integrity hardening):** T-010, T-011, T-012
6. **PR-6 (polish):** T-013, T-014

## Verification gates per PR
- Backend-changing PRs: run API tests + `pnpm run typecheck`
- Frontend-changing PRs: run `pnpm -F @workspace/pm-app test` + `pnpm run typecheck`
- Contract-changing PRs: regenerate codegen and ensure no manual client workarounds remain

---

## Implementation Plan

*Agreed adjustments from planning session (2026-04-16):*
- **T-003** downgraded to Medium — CORS is not a security boundary when using Bearer auth; does not affect Postman/curl
- **T-004** rate-limit only — `hasData` response preserved; removing it would break merge-confirm UX
- **T-007** no behavior change — feature design not finalized; code comment + doc update only
- **T-008** downgraded to P2/Medium — current auto-select does not lose data; explicit selector is UX improvement
- **T-012** error boundary only — no global rate limit; a blanket limit would throttle legitimate bulk operations

---

### PR-1 — P0 Security core: T-001, T-002

**T-001 — Workspace authorization middleware**
New file `artifacts/api-server/src/middlewares/requireWorkspaceAccess.ts` — loads workspace from DB, verifies `workspace.ownerId === req.user.id`, returns 403 on mismatch. Mounted once in `routes/index.ts` at `router.use('/workspaces/:workspaceId', requireWorkspaceAccess)` after `requireAuth`.

**T-002 — Convert task DELETE to soft-delete**
In `routes/tasks.ts`, replace `db.delete(...)` with `db.update(...).set({ deletedAt: now, updatedAt: now })`. 204 response unchanged.

---

### PR-2 — P0 Security edge: T-003, T-004

**T-003 — CORS allowlist** *(Medium — does not affect Postman/curl)*
Replace `app.use(cors())` with allowlist read from `CORS_ALLOWED_ORIGINS` env var. Add to `.env.example`.

**T-004 — Rate-limit `/users/check-email`** *(rate limit only)*
Install `express-rate-limit`. Mount per-IP limiter (10 req / 15 min) on the route only.

---

### PR-3 — P1 Contract + auth UX: T-005, T-006

**T-005 — Fix ensure-personal contract drift**
Update spec to `{ workspaceId: string }` / always `200`. Fix server to return `200` on create. Remove `?? data.id` fallback in `AuthContext.tsx`. Run `/codegen`.

**T-006 — Fix SavePrompt merge-cancel**
Change Cancel on merge-confirm from `handleOpenChange(false)` → `setPanel('email')`. Update `SavePrompt.test.tsx`: existing test asserting `onOpenChange(false)` becomes assertion that email panel is shown with email preserved; add test that `signInWithEmail` is not called.

---

### PR-4 — P1/P2 Planning UX: T-007, T-008, T-009

**T-007 — Multiple active sprints: code comment + docs only** *(no behavior change)*
Add comment above `handleActivate` forEach noting enforcement is intentional and not finalized. Update `guidelines/Guidelines.md` and `guidelines/features-guide.md`.

**T-008 — Explicit reassignment target on column delete** *(P2/Medium)*
In `KanbanBoard.tsx` delete confirmation dialog, add `<select>` for target column. Disable Delete until a valid target is chosen.

**T-009 — Permanent delete in Trash** *(depends on T-002)*
Add `DELETE /workspaces/{workspaceId}/tasks/{taskId}/permanent` to spec. Add hard-delete route in `tasks.ts`. Add "Delete forever" button with confirmation to `TrashBin.tsx`. Run `/codegen`.

---

### PR-5 — P2 Integrity hardening: T-010, T-011, T-012

**T-010 — Cross-workspace FK validation** *(API-layer — no DB schema changes)*
In `tasks.ts` POST/PATCH, verify `columnId` and `sprintId` belong to the workspace. In `sprint-snapshots.ts`, verify `sprintId` belongs to workspace. Return 400 on mismatch.

**T-011 — Validate reassignToId in column DELETE**
Preload source + target columns filtered by `workspaceId` before transaction. Return 404/400 for missing or self-targeting.

**T-012 — Error boundary middleware** *(no global rate limit)*
Add global error-handler middleware in `app.ts` after the router for consistent 500 envelopes.

---

### PR-6 — P3 Polish: T-013, T-014

**T-013 — Remove no-op chart filter**
`allSnapshots.filter((s) => selectedId && true)` → `allSnapshots`.

**T-014 — Accessible labels on icon-only controls**
Add `aria-label` to icon-only buttons across `TodoList.tsx`, `KanbanBoard.tsx`, `SprintManagement.tsx`, `TaskEditModal.tsx`.

---

### Test changes
- `SavePrompt.test.tsx` (T-006): update "Cancel on merge-confirm" test — assert panel returns to email with email preserved; assert `signInWithEmail` not called.
