export * from "./generated/api";
// Note: ./generated/types exports TypeScript types that duplicate names from
// ./generated/api (Zod schemas). No consumer imports from types — all route
// validators use the Zod schemas directly. Omitting the re-export avoids the
// TS2308 ambiguous-export error without breaking any existing imports.
