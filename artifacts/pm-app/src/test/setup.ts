import '@testing-library/jest-dom';

// Env vars needed by modules that read import.meta.env at import time (e.g.
// supabase.ts) are provided via `test.env` in vite.config.ts. They must live
// there, not here: reassigning import.meta.env from a setup file only affects
// this module's own import.meta, leaving other modules with undefined config —
// which is why this used to pass locally (via .env) but crash in CI.
