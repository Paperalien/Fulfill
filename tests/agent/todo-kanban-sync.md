# Test: To-Do ↔ Kanban sync

Verifies that tasks created in the To-Do view appear in the Kanban board, and that edits made in the Kanban board (specifically due date) are reflected back in the To-Do view.

## Preconditions

- Dev server running at http://localhost:5174
- App in local (unauthenticated) mode with no existing tasks

## Steps

1. Navigate to http://localhost:5174
2. If the "Save across devices?" popover appears, dismiss it with "Not now"
3. Confirm the To-Do List page is shown with 0 tasks

**Create task in To-Do**

4. Click "+ Add a task..."
5. Type task title: `Test task from To-Do`
6. Click "Add"
7. **Assert**: task row appears in the To-Do list with status "not started"
8. **Assert**: footer shows "1 active tasks"

**Verify task appears in Kanban**

9. Click "Kanban" in the sidebar
10. **Assert**: "Test task from To-Do" appears as a card in the "To Do" column

**Change due date in Kanban**

11. Hover the task card and click the edit (pencil) icon
12. In the "Edit Task" dialog, set Due Date to a date 8 days from today
13. Click "Save"
14. **Assert**: the Kanban card now shows the due date (e.g. "Due 2026-05-10")

**Verify due date appears in To-Do**

15. Click "To-Do" in the sidebar
16. **Assert**: "Test task from To-Do" row shows the same due date set in step 12

## Pass criteria

All assertions in steps 7, 8, 10, 14, and 16 pass without page reload.
