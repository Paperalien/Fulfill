import { Router, type IRouter } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import {
  workspacesTable,
  workspaceMembersTable,
  workspaceInvitationsTable,
  usersTable,
} from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { sendInvitationEmail } from "../lib/email";

// ── Workspace-scoped router (POST /) ──────────────────────────────────────────
// Mounted at /workspaces/:workspaceId/invitations — auth + membership already checked.

export const workspaceInvitationsRouter: IRouter = Router({ mergeParams: true });

const InviteBody = z.object({ email: z.string().email("Must be a valid email address") });

const APP_URL = process.env.APP_URL ?? "http://localhost:5173";

function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Buffer.from(bytes).toString("base64url");
}

// POST /workspaces/:workspaceId/invitations
workspaceInvitationsRouter.post("/", async (req, res) => {
  const user = req.user!;
  const { workspaceId } = req.params as { workspaceId: string };

  const parsed = InviteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { email: inviteeEmail } = parsed.data;

  try {
    const [workspace] = await db
      .select({ isPersonal: workspacesTable.isPersonal, name: workspacesTable.name })
      .from(workspacesTable)
      .where(eq(workspacesTable.id, workspaceId))
      .limit(1);

    if (workspace?.isPersonal) {
      res.status(403).json({ error: "Cannot invite members to a personal workspace" });
      return;
    }

    const inviterEmail = user.email;

    const token = generateToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const id = crypto.randomUUID();

    await db.insert(workspaceInvitationsTable).values({
      id,
      workspaceId,
      inviterId: user.id,
      inviteeEmail,
      token,
      expiresAt,
    });

    await sendInvitationEmail({
      to: inviteeEmail,
      inviterEmail,
      workspaceName: workspace.name,
      inviteUrl: `${APP_URL}?invite=${token}`,
    });

    res.status(201).json({ id, inviteeEmail, expiresAt });
  } catch (err) {
    req.log.error(err, "Failed to create invitation");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Public router (POST /:token/accept) ───────────────────────────────────────
// Mounted at /invitations — auth required, no workspace membership check yet.

export const invitationsRouter: IRouter = Router();

// POST /invitations/:token/accept
invitationsRouter.post("/:token/accept", async (req, res) => {
  const user = req.user!;
  const { token } = req.params as { token: string };

  try {
    const [invitation] = await db
      .select()
      .from(workspaceInvitationsTable)
      .where(eq(workspaceInvitationsTable.token, token))
      .limit(1);

    if (!invitation) {
      res.status(404).json({ error: "Invitation not found" });
      return;
    }

    if (invitation.used) {
      res.status(410).json({ error: "This invitation has already been used" });
      return;
    }

    if (invitation.expiresAt < new Date()) {
      res.status(410).json({
        error: "This invitation has expired — ask the person who invited you to send a new one",
      });
      return;
    }

    await db.transaction(async (tx) => {
      await tx
        .insert(workspaceMembersTable)
        .values({ workspaceId: invitation.workspaceId, userId: user.id })
        .onConflictDoNothing();

      await tx
        .update(workspaceInvitationsTable)
        .set({ used: true, acceptedAt: new Date() })
        .where(eq(workspaceInvitationsTable.id, invitation.id));
    });

    res.json({ workspaceId: invitation.workspaceId });
  } catch (err) {
    req.log.error(err, "Failed to accept invitation");
    res.status(500).json({ error: "Internal server error" });
  }
});
