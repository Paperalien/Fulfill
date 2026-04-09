import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { workspacesTable } from "./workspaces";

export const columnsTable = pgTable("columns", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().references(() => workspacesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  order: integer("order").notNull(),
  semanticStatus: text("semantic_status").notNull(), // 'not-started' | 'in-progress' | 'done'
  color: text("color"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertColumnSchema = createInsertSchema(columnsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertColumn = typeof columnsTable.$inferInsert;
export type Column = typeof columnsTable.$inferSelect;
