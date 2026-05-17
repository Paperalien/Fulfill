# Workspaces: Shared task management groups

Workspaces are groups of tasks, kanban boards, sprints, gantt boards, and all other entities.

- Entities cannot be moved or copied between workspaces
  - At least — in the first implementation, perhaps in the future

When a user first starts using the app they are in a workspace called the Personal workspace.

All operations that can be done by a user operating the application without using multiple users — the baseline feature set — can be done in the Personal workspace.

Workspaces can be shared by multiple users. All users who are members of a workspace can do any operation on any item in the workspace.

Users operate in one workspace at a time. Users can switch between workspaces at any time.

A user may only have one workspace active in their UI — that is, on their current tab, browser, app instance etc. They can have a different workspace active on all of their UIs open simultaneously.

When a user switches workspaces and has unpersisted changes — specifically, open form state such as a `TaskEditModal` with unsaved edits — those changes are maintained so that when they switch back they do not lose work. However, this is only true in the current session: if the current tab or the app is closed, unpersisted changes are lost.

---

## Planning Poker

Planning Poker is always visible in the navigation regardless of which workspace is active. When the user is in their Personal workspace, the Planning Poker page displays a label explaining that the feature is only really useful in a shared workspace.

---

## UI Requirements

The UI shows which workspace the user is in. The UI will:

- Show the name of the current workspace
- Provide a way of switching between existing workspaces they are part of
- Provide a way of creating a workspace

---

## Workspace Names

- Have a limit of 20 characters
- Must be unique across the system — the uniqueness constraint is enforced at the UI level (and optionally via a DB insert/update trigger). Personal workspaces are exempt from this uniqueness rule.
- Workspaces can be renamed by any member of the workspace (with the same limits that apply to a new workspace name)
  - Personal workspaces cannot be renamed

Internally, workspaces are identified by a unique key (appropriate for the DB schema, like a primary key). The name is not a key, but name collisions are not allowed for user-created workspaces. The UI must handle a duplicate name gracefully (e.g. an inline validation error before submission).

---

## Workspace Lifecycle

- Workspaces can be created by any user
- Workspaces **cannot be deleted**. If every member leaves, the workspace becomes abandoned but remains in the database
- Users can elect to leave a workspace — even ones they created — but not their Personal workspace
- Users can be invited to a workspace by any member of that workspace

---

## Invitations

Users join a workspace by being invited by an existing workspace member, whether the invitee is already a user of the application or not.

- Any workspace can have users invited to it, apart from a Personal workspace
- An invitation is an entity persisted in the database which records:
  - The inviter
  - The invitee (email address)
  - The workspace
  - Date/time of the invitation
  - Whether it has been used
  - Date/time of acceptance
- Invitees are invited by email address
  - Inviters are suggested to let the invitee know so that they're not surprised, and are suggested to tell them to check their junk folder
- A UI will exist for a workspace user to invite someone to a workspace; that UI operates on the workspace the user currently has active
- Once invited, the invitee is sent an email explaining the app, the invitation, and a link to click to join
  - The link encodes an identifier that resolves to the invitation record
  - Invitation emails are sent via **Resend** (`resend` npm package in api-server) using the `accounts@paperalien.com` sender address
- Invitations expire after 7 days. If an invitee follows an expired link, they are shown an error message along the lines of: "This invitation has expired — ask the person who invited you to send a new one"
- When an invitee follows a valid link they are asked to confirm that they want to join
- If a user joins the application via an invitation and accepts it, they are handled in the same way as a normal new user joining the application
