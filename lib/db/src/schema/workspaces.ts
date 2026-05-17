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
]);

export const insertWorkspaceSchema = createInsertSchema(workspacesTable).omit({ id: true, createdAt: true });
export type InsertWorkspace = typeof workspacesTable.$inferInsert;
export type Workspace = typeof workspacesTable.$inferSelect;
