Regenerate React Query hooks and Zod validators from the OpenAPI spec using Orval.

Run the following command from the repo root and report success or any errors:

```
pnpm --filter @workspace/api-spec codegen
```

After completion, summarise which files were regenerated:
- lib/api-client-react/src/generated/api.ts
- lib/api-client-react/src/generated/api.schemas.ts
- lib/api-zod/src/generated/ (all files)
