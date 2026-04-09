import { pgTable, text, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { workspacesTable } from "./workspaces";
import { sprintsTable } from "./sprints";

export const sprintSnapshotsTable = pgTable("sprint_snapshots", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().references(() => workspacesTable.id, { onDelete: "cascade" }),
  sprintId: text("sprint_id").notNull().references(() => sprintsTable.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  total: integer("total").notNull(),
  done: integer("done").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique().on(t.sprintId, t.date),
]);

export const insertSprintSnapshotSchema = createInsertSchema(sprintSnapshotsTable).omit({ id: true, createdAt: true });
export type InsertSprintSnapshot = typeof sprintSnapshotsTable.$inferInsert;
export type SprintSnapshot = typeof sprintSnapshotsTable.$inferSelect;
