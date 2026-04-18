/**
 * Agent A — OpenAPI Drift Detector
 *
 * Compares the OpenAPI spec against the Express route implementations and
 * reports any endpoints that exist in one but not the other.
 *
 * Run: pnpm check:drift
 */

import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "../../");
const SPEC_PATH = join(REPO_ROOT, "lib/api-spec/openapi.yaml");
const ROUTES_DIR = join(REPO_ROOT, "artifacts/api-server/src/routes");
const ROUTES_INDEX = join(ROUTES_DIR, "index.ts");

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Endpoint {
  method: string;
  path: string;
}

export interface DiffResult {
  matched: Endpoint[];
  missing: Endpoint[];  // in spec, not in implementation
  extra: Endpoint[];    // in implementation, not in spec
}

// ── YAML path parser ──────────────────────────────────────────────────────────

/**
 * Extracts all { method, path } pairs from an OpenAPI YAML string.
 * Uses a line-based parser (no external YAML library) that works reliably
 * with the well-structured openapi.yaml format used in this project.
 *
 * Path params are normalized: {workspaceId} → :workspaceId
 */
export function parseSpecEndpoints(yaml: string): Endpoint[] {
  const endpoints: Endpoint[] = [];
  const lines = yaml.split("\n");

  let inPaths = false;
  let currentPath = "";

  for (const line of lines) {
    if (line.trimEnd() === "paths:") {
      inPaths = true;
      continue;
    }

    if (!inPaths) continue;

    // Top-level key at 0 indent (other than paths block) means we've left paths
    if (line.length > 0 && !line.startsWith(" ") && !line.startsWith("#")) {
      inPaths = false;
      continue;
    }

    // Path entry: exactly 2-space indent, starts with /
    const pathMatch = line.match(/^  (\/[^\s:]*)\s*:/);
    if (pathMatch) {
      currentPath = normalizePathParams(pathMatch[1]);
      continue;
    }

    // Method entry: exactly 4-space indent, http method name
    if (currentPath) {
      const methodMatch = line.match(/^    (get|post|patch|delete|put|head|options)\s*:/);
      if (methodMatch) {
        endpoints.push({ method: methodMatch[1].toUpperCase(), path: currentPath });
      }
    }
  }

  return endpoints;
}

/**
 * Extracts Express route declarations from a single router source file.
 * Combines the mount prefix with the relative route path.
 *
 * Handles:
 *   router.get("/")         → prefix only
 *   router.post("/:id")     → prefix + /:id
 *   router.delete("/bulk")  → prefix + /bulk
 */
export function parseRouterFile(source: string, prefix: string): Endpoint[] {
  const endpoints: Endpoint[] = [];
  const pattern = /router\.(get|post|patch|delete|put)\s*\(\s*["'`]([^"'`]*)["'`]/g;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    const method = match[1].toUpperCase();
    const relativePath = match[2];

    let fullPath: string;
    if (relativePath === "/") {
      fullPath = prefix || "/";
    } else {
      fullPath = prefix + relativePath;
    }

    endpoints.push({ method, path: fullPath });
  }

  return endpoints;
}

/**
 * Parses routes/index.ts to extract the mount prefix for each router file.
 * Returns a map of: routerFile (without extension) → mount prefix
 *
 * Handles these patterns:
 *   router.use(healthRouter)                       → prefix ""
 *   router.use("/workspaces", workspacesRouter)   → prefix "/workspaces"
 */
export function parseRouteMounts(indexSource: string): Map<string, string> {
  const mounts = new Map<string, string>();

  // Pattern 1: router.use("/prefix", someRouter) → prefix = "/prefix"
  const withPrefix = /router\.use\(\s*["'`]([^"'`]+)["'`]\s*,\s*(\w+)\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = withPrefix.exec(indexSource)) !== null) {
    const prefix = match[1];
    const varName = match[2];
    // Extract the imported file name from the import statement
    const importName = resolveImportName(indexSource, varName);
    if (importName) mounts.set(importName, prefix);
  }

  // Pattern 2: router.use(someRouter) → prefix ""
  const withoutPrefix = /router\.use\(\s*(\w+)\s*\)/g;
  while ((match = withoutPrefix.exec(indexSource)) !== null) {
    const varName = match[1];
    if (varName === "requireAuth" || varName === "requireWorkspaceAccess") continue;
    const importName = resolveImportName(indexSource, varName);
    if (importName && !mounts.has(importName)) {
      mounts.set(importName, "");
    }
  }

  return mounts;
}

function resolveImportName(source: string, varName: string): string | null {
  // import varName from "./filename"  OR  import varName from "./filename.ts"
  const importPattern = new RegExp(
    `import\\s+${varName}\\s+from\\s+["'](\\.[^"']+)["']`
  );
  const m = source.match(importPattern);
  if (!m) return null;
  // Return just the base filename without path prefix or extension
  return m[1].replace(/^.*\//, "").replace(/\.(ts|js)$/, "");
}

/**
 * Compares spec endpoints against implemented endpoints.
 * Normalizes all paths before comparison.
 */
export function diffEndpoints(
  spec: Endpoint[],
  impl: Endpoint[]
): DiffResult {
  const toKey = (e: Endpoint) => `${e.method} ${normalizePath(e.path)}`;

  const specKeys = new Map(spec.map((e) => [toKey(e), e]));
  const implKeys = new Map(impl.map((e) => [toKey(e), e]));

  const matched: Endpoint[] = [];
  const missing: Endpoint[] = [];
  const extra: Endpoint[] = [];

  for (const [key, endpoint] of specKeys) {
    if (implKeys.has(key)) {
      matched.push(endpoint);
    } else {
      missing.push(endpoint);
    }
  }

  for (const [key, endpoint] of implKeys) {
    if (!specKeys.has(key)) {
      extra.push(endpoint);
    }
  }

  return { matched, missing, extra };
}

// ── Path normalization ────────────────────────────────────────────────────────

/** Converts OpenAPI {param} syntax to Express :param syntax */
export function normalizePathParams(path: string): string {
  return path.replace(/\{([^}]+)\}/g, ":$1");
}

/** Strips trailing slashes for consistent comparison */
function normalizePath(path: string): string {
  return normalizePathParams(path).replace(/\/$/, "") || "/";
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main(): void {
  const specYaml = readFileSync(SPEC_PATH, "utf8");
  const specEndpoints = parseSpecEndpoints(specYaml);

  const indexSource = readFileSync(ROUTES_INDEX, "utf8");
  const mounts = parseRouteMounts(indexSource);

  const implEndpoints: Endpoint[] = [];
  const routeFiles = readdirSync(ROUTES_DIR).filter(
    (f) => f.endsWith(".ts") && f !== "index.ts"
  );

  for (const file of routeFiles) {
    const basename = file.replace(/\.ts$/, "");
    const prefix = mounts.get(basename) ?? "";
    const source = readFileSync(join(ROUTES_DIR, file), "utf8");
    const routes = parseRouterFile(source, prefix);
    implEndpoints.push(...routes);
  }

  const { matched, missing, extra } = diffEndpoints(specEndpoints, implEndpoints);

  const ok = "\x1b[32m✓\x1b[0m";
  const warn = "\x1b[33m!\x1b[0m";
  const err = "\x1b[31m✗\x1b[0m";

  console.log("\n=== OpenAPI Drift Report ===\n");

  if (matched.length > 0) {
    console.log(`${ok} Matched (${matched.length}):`);
    for (const e of matched) {
      console.log(`    ${e.method.padEnd(7)} ${e.path}`);
    }
  }

  if (extra.length > 0) {
    console.log(`\n${warn} In implementation but NOT in spec (${extra.length}):`);
    for (const e of extra) {
      console.log(`    ${e.method.padEnd(7)} ${e.path}`);
    }
  }

  if (missing.length > 0) {
    console.log(`\n${err} In spec but NOT implemented (${missing.length}):`);
    for (const e of missing) {
      console.log(`    ${e.method.padEnd(7)} ${e.path}`);
    }
  }

  console.log();

  if (missing.length > 0) {
    console.error(`\x1b[31mFailed: ${missing.length} spec endpoint(s) have no implementation.\x1b[0m\n`);
    process.exit(1);
  } else {
    console.log(`\x1b[32mAll spec endpoints are implemented.\x1b[0m\n`);
  }
}

if (process.argv[1] === import.meta.filename) {
  main();
}
