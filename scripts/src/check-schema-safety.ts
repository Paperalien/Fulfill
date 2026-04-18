/**
 * Agent B — Schema Safety Checker
 *
 * Compares the last-pushed Drizzle snapshot against the current TypeScript
 * schema files and reports potentially breaking changes:
 *   • Dropped tables (data loss)
 *   • Dropped columns (data loss)
 *   • New NOT NULL columns without defaults (INSERT would fail on existing rows)
 *
 * Run: pnpm check:schema
 * Safe to run without a database connection.
 */

import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "../../");
const SNAPSHOT_PATH = join(REPO_ROOT, "lib/db/drizzle/meta/0000_snapshot.json");
const SCHEMA_DIR = join(REPO_ROOT, "lib/db/src/schema");

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SnapshotColumn {
  name: string;
  type: string;
  notNull: boolean;
  hasDefault: boolean;
}

export interface SchemaColumn {
  propName: string;   // TypeScript property name
  dbName: string;     // database column name
  notNull: boolean;
  hasDefault: boolean;
}

export interface SchemaDiff {
  droppedTables: string[];
  droppedColumns: Array<{ table: string; column: string }>;
  breakingAdditions: Array<{ table: string; column: string; reason: string }>;
}

// ── Snapshot parser ───────────────────────────────────────────────────────────

/**
 * Parses the Drizzle snapshot JSON into a structured map.
 * Returns: tableName → columnDbName → SnapshotColumn
 */
export function parseSnapshotColumns(
  snapshot: Record<string, unknown>
): Map<string, Map<string, SnapshotColumn>> {
  const result = new Map<string, Map<string, SnapshotColumn>>();

  const tables = (snapshot as { tables?: Record<string, unknown> }).tables ?? {};

  for (const [tableKey, tableVal] of Object.entries(tables)) {
    // tableKey is "public.users" — strip schema prefix
    const tableName = tableKey.replace(/^[^.]+\./, "");
    const columns = (tableVal as { columns?: Record<string, unknown> }).columns ?? {};
    const colMap = new Map<string, SnapshotColumn>();

    for (const [colName, colVal] of Object.entries(columns)) {
      const col = colVal as {
        type?: string;
        notNull?: boolean;
        default?: unknown;
        primaryKey?: boolean;
      };
      colMap.set(colName, {
        name: colName,
        type: col.type ?? "unknown",
        notNull: col.notNull ?? false,
        hasDefault: col.default !== undefined || col.primaryKey === true,
      });
    }

    result.set(tableName, colMap);
  }

  return result;
}

// ── TypeScript schema parser ──────────────────────────────────────────────────

/**
 * Extracts the content of the outermost `{ ... }` block starting at `startIdx`
 * in `source`, correctly handling nested braces and string literals.
 */
function extractBraceBlock(source: string, startIdx: number): string {
  let depth = 0;
  let inString = false;
  let stringChar = "";
  let blockStart = -1;

  for (let i = startIdx; i < source.length; i++) {
    const ch = source[i];

    if (inString) {
      if (ch === stringChar && source[i - 1] !== "\\") inString = false;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      inString = true;
      stringChar = ch;
    } else if (ch === "{") {
      if (depth === 0) blockStart = i + 1;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && blockStart >= 0) {
        return source.slice(blockStart, i);
      }
    }
  }
  return "";
}

/**
 * Extracts column definitions from a Drizzle ORM TypeScript schema source.
 * Returns: tableName → columnDbName → SchemaColumn
 *
 * Handles the single-line column definition pattern used throughout this project:
 *   propName: type("db_name").notNull().default(...)
 *
 * Uses a brace-aware extractor so nested objects like
 * `timestamp("col", { withTimezone: true })` don't truncate the table body.
 */
export function parseSchemaSource(
  source: string
): Map<string, Map<string, SchemaColumn>> {
  const result = new Map<string, Map<string, SchemaColumn>>();

  // Find each pgTable("name", { ... }) declaration
  const tableHeader = /pgTable\s*\(\s*["'](\w+)["']\s*,\s*/g;
  let headerMatch: RegExpExecArray | null;

  while ((headerMatch = tableHeader.exec(source)) !== null) {
    const tableName = headerMatch[1];
    const bodyStart = headerMatch.index + headerMatch[0].length;
    const tableBody = extractBraceBlock(source, bodyStart);
    if (!tableBody) continue;

    const colMap = new Map<string, SchemaColumn>();

    // Each top-level line in the table body is a column definition.
    // We process line-by-line; nested braces within a line are part of the type options.
    const lines = tableBody.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("//")) continue;

      // Match: propName: type("db_name") or propName: type("db_name", { ... })
      const colPattern = /^(\w+)\s*:\s*\w+\s*\(\s*["']([^"']+)["']/;
      const colMatch = trimmed.match(colPattern);
      if (!colMatch) continue;

      const propName = colMatch[1];
      const dbName = colMatch[2];

      // Detect .notNull() anywhere on the line
      const notNull = /\.notNull\s*\(\s*\)/.test(trimmed) || /\.primaryKey\s*\(\s*\)/.test(trimmed);

      // Detect any form of default
      const hasDefault =
        /\.default\s*\(/.test(trimmed) ||
        /\.defaultNow\s*\(/.test(trimmed) ||
        /\.primaryKey\s*\(/.test(trimmed);

      colMap.set(dbName, { propName, dbName, notNull, hasDefault });
    }

    result.set(tableName, colMap);
  }

  return result;
}

// ── Diff engine ───────────────────────────────────────────────────────────────

/**
 * Compares the snapshot (last pushed) schema against the current TypeScript
 * schema and returns a report of breaking changes.
 */
export function diffSchema(
  snapshot: Map<string, Map<string, SnapshotColumn>>,
  current: Map<string, Map<string, SchemaColumn>>
): SchemaDiff {
  const droppedTables: string[] = [];
  const droppedColumns: Array<{ table: string; column: string }> = [];
  const breakingAdditions: Array<{ table: string; column: string; reason: string }> = [];

  // Check for dropped tables and dropped/modified columns
  for (const [tableName, snapshotCols] of snapshot) {
    if (!current.has(tableName)) {
      droppedTables.push(tableName);
      continue;
    }

    const currentCols = current.get(tableName)!;

    for (const [colName] of snapshotCols) {
      if (!currentCols.has(colName)) {
        droppedColumns.push({ table: tableName, column: colName });
      }
    }
  }

  // Check for new columns that would break existing rows
  for (const [tableName, currentCols] of current) {
    const snapshotCols = snapshot.get(tableName);
    if (!snapshotCols) continue; // new table — not breaking (no existing rows)

    for (const [colName, col] of currentCols) {
      if (!snapshotCols.has(colName)) {
        // New column — only breaking if NOT NULL and no default
        if (col.notNull && !col.hasDefault) {
          breakingAdditions.push({
            table: tableName,
            column: colName,
            reason: "NOT NULL column without DEFAULT — INSERT will fail on existing rows",
          });
        }
      }
    }
  }

  return { droppedTables, droppedColumns, breakingAdditions };
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main(): void {
  const snapshotJson = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8")) as Record<string, unknown>;
  const snapshot = parseSnapshotColumns(snapshotJson);

  const schemaFiles = readdirSync(SCHEMA_DIR).filter(
    (f) => f.endsWith(".ts") && f !== "index.ts"
  );

  const current = new Map<string, Map<string, SchemaColumn>>();
  for (const file of schemaFiles) {
    const source = readFileSync(join(SCHEMA_DIR, file), "utf8");
    const tables = parseSchemaSource(source);
    for (const [table, cols] of tables) {
      current.set(table, cols);
    }
  }

  const { droppedTables, droppedColumns, breakingAdditions } = diffSchema(snapshot, current);

  const ok = "\x1b[32m✓\x1b[0m";
  const err = "\x1b[31m✗\x1b[0m";

  console.log("\n=== Schema Safety Report ===\n");

  const totalIssues = droppedTables.length + droppedColumns.length + breakingAdditions.length;

  if (droppedTables.length > 0) {
    console.log(`${err} Dropped tables (${droppedTables.length}) — DATA LOSS:`);
    for (const t of droppedTables) {
      console.log(`    ${t}`);
    }
    console.log();
  }

  if (droppedColumns.length > 0) {
    console.log(`${err} Dropped columns (${droppedColumns.length}) — DATA LOSS:`);
    for (const { table, column } of droppedColumns) {
      console.log(`    ${table}.${column}`);
    }
    console.log();
  }

  if (breakingAdditions.length > 0) {
    console.log(`${err} Breaking column additions (${breakingAdditions.length}):`);
    for (const { table, column, reason } of breakingAdditions) {
      console.log(`    ${table}.${column} — ${reason}`);
    }
    console.log();
  }

  if (totalIssues === 0) {
    console.log(`${ok} No breaking schema changes detected.\n`);
    console.log("Tables in snapshot:", [...snapshot.keys()].join(", "));
    console.log("Tables in current schema:", [...current.keys()].join(", "));
    console.log();
  } else {
    console.error(
      `\x1b[31mFailed: ${totalIssues} breaking change(s) detected. Review before running db-push.\x1b[0m\n`
    );
    process.exit(1);
  }
}

if (process.argv[1] === import.meta.filename) {
  main();
}
