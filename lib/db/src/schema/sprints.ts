import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { workspacesTable } from "./workspaces";

export const sprintsTable = pgTable("sprints", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().references(() => workspacesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  isActive: boolean("is_active").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSprintSchema = createInsertSchema(sprintsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSprint = typeof sprintsTable.$inferInsert;
export type Sprint = typeof sprintsTable.$inferSelect;
