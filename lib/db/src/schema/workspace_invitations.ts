import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { workspacesTable } from "./workspaces";
import { usersTable } from "./users";

export const workspaceInvitationsTable = pgTable("workspace_invitations", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().references(() => workspacesTable.id, { onDelete: "cascade" }),
  inviterId: text("inviter_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  inviteeEmail: text("invitee_email").notNull(),
  // 32-byte URL-safe random token (base64url); unique so it can be looked up directly.
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // Set by the application to createdAt + 7 days.
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  used: boolean("used").notNull().default(false),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
});

export const insertWorkspaceInvitationSchema = createInsertSchema(workspaceInvitationsTable).omit({
  createdAt: true,
  used: true,
  acceptedAt: true,
});
export type WorkspaceInvitation = typeof workspaceInvitationsTable.$inferSelect;
export type InsertWorkspaceInvitation = typeof workspaceInvitationsTable.$inferInsert;
