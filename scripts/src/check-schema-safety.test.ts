import { describe, it, expect } from "vitest";
import {
  parseSnapshotColumns,
  parseSchemaSource,
  diffSchema,
  type SnapshotColumn,
  type SchemaColumn,
} from "./check-schema-safety";

// ── parseSnapshotColumns ──────────────────────────────────────────────────────

const SAMPLE_SNAPSHOT = {
  tables: {
    "public.tasks": {
      columns: {
        id: { type: "text", primaryKey: true, notNull: true },
        title: { type: "text", notNull: true },
        notes: { type: "text", notNull: true, default: "''" },
        story_points: { type: "integer", notNull: false },
        deleted_at: { type: "timestamp with time zone", notNull: false },
      },
    },
    "public.workspaces": {
      columns: {
        id: { type: "text", primaryKey: true, notNull: true },
        name: { type: "text", notNull: true },
        owner_id: { type: "text", notNull: true },
        created_at: { type: "timestamp with time zone", notNull: true, default: "now()" },
      },
    },
  },
};

describe("parseSnapshotColumns", () => {
  it("returns a map keyed by table name without schema prefix", () => {
    const result = parseSnapshotColumns(SAMPLE_SNAPSHOT as Record<string, unknown>);
    expect(result.has("tasks")).toBe(true);
    expect(result.has("workspaces")).toBe(true);
    expect(result.has("public.tasks")).toBe(false);
  });

  it("parses column names and notNull correctly", () => {
    const result = parseSnapshotColumns(SAMPLE_SNAPSHOT as Record<string, unknown>);
    const tasks = result.get("tasks")!;
    expect(tasks.get("title")?.notNull).toBe(true);
    expect(tasks.get("story_points")?.notNull).toBe(false);
  });

  it("detects hasDefault from default key", () => {
    const result = parseSnapshotColumns(SAMPLE_SNAPSHOT as Record<string, unknown>);
    const tasks = result.get("tasks")!;
    expect(tasks.get("notes")?.hasDefault).toBe(true);
    expect(tasks.get("title")?.hasDefault).toBe(false);
  });

  it("treats primaryKey columns as having a default", () => {
    const result = parseSnapshotColumns(SAMPLE_SNAPSHOT as Record<string, unknown>);
    const tasks = result.get("tasks")!;
    expect(tasks.get("id")?.hasDefault).toBe(true);
  });

  it("handles an empty snapshot gracefully", () => {
    const result = parseSnapshotColumns({});
    expect(result.size).toBe(0);
  });
});

// ── parseSchemaSource ─────────────────────────────────────────────────────────

const SAMPLE_SCHEMA_SOURCE = `
import { pgTable } from "drizzle-orm/pg-core";

export const tasksTable = pgTable("tasks", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  notes: text("notes").notNull().default(""),
  storyPoints: integer("story_points"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  newField: text("new_field").notNull(),
});

export const workspacesTable = pgTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
`;

describe("parseSchemaSource", () => {
  it("extracts both tables", () => {
    const result = parseSchemaSource(SAMPLE_SCHEMA_SOURCE);
    expect(result.has("tasks")).toBe(true);
    expect(result.has("workspaces")).toBe(true);
  });

  it("extracts column db names correctly", () => {
    const result = parseSchemaSource(SAMPLE_SCHEMA_SOURCE);
    const tasks = result.get("tasks")!;
    expect(tasks.has("id")).toBe(true);
    expect(tasks.has("title")).toBe(true);
    expect(tasks.has("story_points")).toBe(true);
    expect(tasks.has("deleted_at")).toBe(true);
    expect(tasks.has("new_field")).toBe(true);
  });

  it("detects notNull from .notNull()", () => {
    const result = parseSchemaSource(SAMPLE_SCHEMA_SOURCE);
    const tasks = result.get("tasks")!;
    expect(tasks.get("title")?.notNull).toBe(true);
    expect(tasks.get("story_points")?.notNull).toBe(false);
    expect(tasks.get("new_field")?.notNull).toBe(true);
  });

  it("detects hasDefault from .default()", () => {
    const result = parseSchemaSource(SAMPLE_SCHEMA_SOURCE);
    const tasks = result.get("tasks")!;
    expect(tasks.get("notes")?.hasDefault).toBe(true);
    expect(tasks.get("title")?.hasDefault).toBe(false);
  });

  it("detects hasDefault from .defaultNow()", () => {
    const result = parseSchemaSource(SAMPLE_SCHEMA_SOURCE);
    const workspaces = result.get("workspaces")!;
    expect(workspaces.get("created_at")?.hasDefault).toBe(true);
  });

  it("detects hasDefault from .primaryKey()", () => {
    const result = parseSchemaSource(SAMPLE_SCHEMA_SOURCE);
    const tasks = result.get("tasks")!;
    expect(tasks.get("id")?.hasDefault).toBe(true);
  });
});

// ── diffSchema ────────────────────────────────────────────────────────────────

function makeSnapshotMap(
  tables: Record<string, Record<string, Partial<SnapshotColumn>>>
): Map<string, Map<string, SnapshotColumn>> {
  const result = new Map<string, Map<string, SnapshotColumn>>();
  for (const [table, cols] of Object.entries(tables)) {
    const colMap = new Map<string, SnapshotColumn>();
    for (const [col, val] of Object.entries(cols)) {
      colMap.set(col, { name: col, type: "text", notNull: false, hasDefault: false, ...val });
    }
    result.set(table, colMap);
  }
  return result;
}

function makeCurrentMap(
  tables: Record<string, Record<string, Partial<SchemaColumn>>>
): Map<string, Map<string, SchemaColumn>> {
  const result = new Map<string, Map<string, SchemaColumn>>();
  for (const [table, cols] of Object.entries(tables)) {
    const colMap = new Map<string, SchemaColumn>();
    for (const [col, val] of Object.entries(cols)) {
      colMap.set(col, { propName: col, dbName: col, notNull: false, hasDefault: false, ...val });
    }
    result.set(table, colMap);
  }
  return result;
}

describe("diffSchema", () => {
  it("returns empty diff when schemas are identical", () => {
    const snapshot = makeSnapshotMap({ tasks: { id: {}, title: {} } });
    const current = makeCurrentMap({ tasks: { id: {}, title: {} } });
    const diff = diffSchema(snapshot, current);
    expect(diff.droppedTables).toHaveLength(0);
    expect(diff.droppedColumns).toHaveLength(0);
    expect(diff.breakingAdditions).toHaveLength(0);
  });

  it("detects dropped tables", () => {
    const snapshot = makeSnapshotMap({ tasks: { id: {} }, sprints: { id: {} } });
    const current = makeCurrentMap({ tasks: { id: {} } });
    const diff = diffSchema(snapshot, current);
    expect(diff.droppedTables).toContain("sprints");
  });

  it("detects dropped columns", () => {
    const snapshot = makeSnapshotMap({ tasks: { id: {}, title: {}, notes: {} } });
    const current = makeCurrentMap({ tasks: { id: {}, title: {} } });
    const diff = diffSchema(snapshot, current);
    expect(diff.droppedColumns).toContainEqual({ table: "tasks", column: "notes" });
  });

  it("detects breaking column additions (NOT NULL, no default)", () => {
    const snapshot = makeSnapshotMap({ tasks: { id: {} } });
    const current = makeCurrentMap({ tasks: { id: {}, priority: { notNull: true, hasDefault: false } } });
    const diff = diffSchema(snapshot, current);
    expect(diff.breakingAdditions).toContainEqual(
      expect.objectContaining({ table: "tasks", column: "priority" })
    );
  });

  it("does NOT flag new nullable columns as breaking", () => {
    const snapshot = makeSnapshotMap({ tasks: { id: {} } });
    const current = makeCurrentMap({ tasks: { id: {}, notes: { notNull: false } } });
    const diff = diffSchema(snapshot, current);
    expect(diff.breakingAdditions).toHaveLength(0);
  });

  it("does NOT flag new NOT NULL columns WITH defaults as breaking", () => {
    const snapshot = makeSnapshotMap({ tasks: { id: {} } });
    const current = makeCurrentMap({ tasks: { id: {}, status: { notNull: true, hasDefault: true } } });
    const diff = diffSchema(snapshot, current);
    expect(diff.breakingAdditions).toHaveLength(0);
  });

  it("does NOT flag new tables as breaking (no existing rows)", () => {
    const snapshot = makeSnapshotMap({ tasks: { id: {} } });
    const current = makeCurrentMap({ tasks: { id: {} }, sprints: { id: { notNull: true } } });
    const diff = diffSchema(snapshot, current);
    expect(diff.droppedTables).toHaveLength(0);
    expect(diff.breakingAdditions).toHaveLength(0);
  });
});
