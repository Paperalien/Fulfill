Start the api-server and pm-app in parallel development mode.

Run both commands as background processes from the repo root:

1. API server — build first then start with env file:
```
pnpm --filter @workspace/api-server build && node --env-file=artifacts/api-server/.env --enable-source-maps artifacts/api-server/dist/index.mjs
```

2. Frontend (Vite dev server):
```
pnpm --filter @workspace/pm-app dev
```

Start them both in the background using run_in_background, then report the URLs:
- API: http://localhost:3000
- App: http://localhost:5173 (or whichever port Vite selects)
