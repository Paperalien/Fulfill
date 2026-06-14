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

// Identifiers that may appear as the last argument of `router.use(...)` but are
// middleware, not mounted routers — never treat them as a sub-router mount.
const MIDDLEWARE_NAMES = new Set(["requireAuth", "requireWorkspaceAccess"]);

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Endpoint {
  method: string;
  path: string;
}

export interface ImportInfo {
  file: string; // basename without extension
  named: boolean; // true for `import { x } from`, false for `import x from`
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

// ── Express route/mount parser ─────────────────────────────────────────────────

/**
 * Extracts route declarations from a router source file, attributing each to the
 * correct mount prefix.
 *
 * `varToPrefix` maps a *local* router variable name (as used in the file, e.g.
 * `router`, or named exports like `invitationsRouter`) to its mount prefix. A
 * single file may declare several routers with different prefixes (e.g.
 * invitations.ts), so matching is per-variable rather than per-file.
 *
 *   router.get("/")          → prefix only
 *   router.post("/:id")      → prefix + /:id
 *   invitationsRouter.post("/:token/accept") → its own prefix + /:token/accept
 */
export function parseRouterFile(
  source: string,
  varToPrefix: Map<string, string>,
): Endpoint[] {
  const endpoints: Endpoint[] = [];
  // Capture `<ident>.<method>("<path>"` — any identifier, not just `router`.
  const pattern = /(\w+)\.(get|post|patch|delete|put)\s*\(\s*["'`]([^"'`]*)["'`]/g;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    const varName = match[1];
    if (!varToPrefix.has(varName)) continue; // not a mounted router (e.g. a chained call)

    const prefix = varToPrefix.get(varName)!;
    const method = match[2].toUpperCase();
    const relativePath = match[3];

    const fullPath = relativePath === "/" ? prefix || "/" : prefix + relativePath;
    endpoints.push({ method, path: fullPath });
  }

  return endpoints;
}

/**
 * Parses routes/index.ts and returns a map of *router variable name* → mount
 * prefix. Keyed by variable (not file) so that a file exporting several routers
 * mounted at different prefixes is represented faithfully.
 *
 * Handles:
 *   router.use(healthRouter)                                  → ""
 *   router.use("/workspaces", workspacesRouter)               → "/workspaces"
 *   router.use("/p/:id/tasks", requireWorkspaceAccess, tasksRouter) → "/p/:id/tasks"
 *   router.use(requireAuth)                                   → ignored (middleware)
 */
export function parseRouteMounts(indexSource: string): Map<string, string> {
  const mounts = new Map<string, string>();

  const useCall = /router\.use\(([^)]*)\)/g;
  let match: RegExpExecArray | null;
  while ((match = useCall.exec(indexSource)) !== null) {
    const args = match[1].trim();
    if (!args) continue;

    let prefix = "";
    let rest = args;
    const strMatch = args.match(/^["'`]([^"'`]+)["'`]\s*,?\s*([\s\S]*)$/);
    if (strMatch) {
      prefix = strMatch[1];
      rest = strMatch[2];
    }

    // The mounted router is the LAST identifier argument; any earlier identifiers
    // are middleware (e.g. requireWorkspaceAccess).
    const identifiers = rest
      .split(",")
      .map((s) => s.trim())
      .filter((s) => /^\w+$/.test(s));
    const varName = identifiers[identifiers.length - 1];
    if (!varName || MIDDLEWARE_NAMES.has(varName)) continue;

    mounts.set(varName, prefix);
  }

  return mounts;
}

/**
 * Maps every imported identifier in index.ts to its source file and whether it
 * was a default or named import. Handles both:
 *   import healthRouter from "./health";
 *   import { workspaceInvitationsRouter, invitationsRouter } from "./invitations";
 */
export function parseImports(indexSource: string): Map<string, ImportInfo> {
  const imports = new Map<string, ImportInfo>();
  const basename = (p: string) => p.replace(/^.*\//, "").replace(/\.(ts|js)$/, "");

  // Named: import { a, b as c } from "./file"
  const named = /import\s*\{([^}]+)\}\s*from\s*["'](\.[^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = named.exec(indexSource)) !== null) {
    const file = basename(m[2]);
    for (const part of m[1].split(",")) {
      // support `original as alias` → the local name is the alias
      const name = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (name) imports.set(name, { file, named: true });
    }
  }

  // Default: import x from "./file"
  const def = /import\s+(\w+)\s+from\s+["'](\.[^"']+)["']/g;
  while ((m = def.exec(indexSource)) !== null) {
    imports.set(m[1], { file: basename(m[2]), named: false });
  }

  return imports;
}

/** Finds the identifier in `export default <ident>` (falls back to "router"). */
function defaultExportName(source: string): string {
  return source.match(/export\s+default\s+(\w+)/)?.[1] ?? "router";
}

// ── Diff ────────────────────────────────────────────────────────────────────

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

// ── Implementation collector ───────────────────────────────────────────────────

/**
 * Walks the route files and returns every implemented endpoint, resolving mount
 * prefixes via index.ts. Exported for testing.
 */
export function collectImplEndpoints(
  indexSource: string,
  readFile: (basename: string) => string,
  routeFiles: string[],
): Endpoint[] {
  const imports = parseImports(indexSource);
  const mounts = parseRouteMounts(indexSource); // routerVarName → prefix

  const impl: Endpoint[] = [];
  for (const file of routeFiles) {
    const basename = file.replace(/\.ts$/, "");
    const source = readFile(file);

    // Build local-variable → prefix for this file from the mounts that resolve here.
    const varToPrefix = new Map<string, string>();
    for (const [varName, prefix] of mounts) {
      const imp = imports.get(varName);
      if (!imp || imp.file !== basename) continue;
      const localVar = imp.named ? varName : defaultExportName(source);
      varToPrefix.set(localVar, prefix);
    }
    if (varToPrefix.size === 0) continue;

    impl.push(...parseRouterFile(source, varToPrefix));
  }
  return impl;
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main(): void {
  const specYaml = readFileSync(SPEC_PATH, "utf8");
  const specEndpoints = parseSpecEndpoints(specYaml);

  const indexSource = readFileSync(ROUTES_INDEX, "utf8");
  const routeFiles = readdirSync(ROUTES_DIR).filter(
    (f) => f.endsWith(".ts") && f !== "index.ts" && !f.endsWith(".test.ts")
  );

  const implEndpoints = collectImplEndpoints(
    indexSource,
    (file) => readFileSync(join(ROUTES_DIR, file), "utf8"),
    routeFiles,
  );

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
