import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { workspacesTable } from "./workspaces";
import { columnsTable } from "./columns";
import { sprintsTable } from "./sprints";

export const tasksTable = pgTable("tasks", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().references(() => workspacesTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  notes: text("notes").notNull().default(""),
  columnId: text("column_id").notNull().references(() => columnsTable.id),
  sprintId: text("sprint_id").references(() => sprintsTable.id, { onDelete: "set null" }),
  storyPoints: integer("story_points"),
  order: integer("order").notNull().default(0),
  dueDate: text("due_date"),
  inProgressAt: timestamp("in_progress_at", { withTimezone: true }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  parentId: text("parent_id"), // self-reference, no FK constraint to avoid circular init
  predecessorIds: text("predecessor_ids").array(),
  tags: text("tags").array(),
  reminder: text("reminder"),
  reminderDismissedAt: text("reminder_dismissed_at"),
  recurrence: text("recurrence"), // 'daily' | 'weekly' | 'monthly'
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTaskSchema = createInsertSchema(tasksTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTask = typeof tasksTable.$inferInsert;
export type Task = typeof tasksTable.$inferSelect;
