Push the Drizzle schema to the local PostgreSQL database.

Run the following command from the repo root and report success or any errors:

```
DATABASE_URL=postgresql://christian@localhost:5432/fulfill pnpm --filter @workspace/db push
```

If there are conflicts or destructive changes, use `push-force` only if the user explicitly confirms.
