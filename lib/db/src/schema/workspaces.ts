import { pgTable, text, timestamp, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { usersTable } from "./users";

export const workspacesTable = pgTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  ownerId: text("owner_id").notNull().references(() => usersTable.id),
  isPersonal: boolean("is_personal").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // Names must be unique across shared workspaces; personal workspaces are exempt.
  uniqueIndex("workspaces_name_shared_unique").on(t.name).where(sql`${t.isPersonal} = false`),
  // A user may own at most ONE personal workspace. This preserves the
  // one-personal-per-user guarantee that previously came from a blanket UNIQUE on
  // owner_id, while still allowing a user to own many *shared* workspaces (the
  // blanket UNIQUE was incompatible with the multi-workspace feature).
  uniqueIndex("workspaces_owner_personal_unique").on(t.ownerId).where(sql`${t.isPersonal} = true`),
]).enableRLS();

export const insertWorkspaceSchema = createInsertSchema(workspacesTable).omit({ id: true, createdAt: true });
export type InsertWorkspace = typeof workspacesTable.$inferInsert;
export type Workspace = typeof workspacesTable.$inferSelect;
