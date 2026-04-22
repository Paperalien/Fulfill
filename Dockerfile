FROM node:20-alpine

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app
COPY . .

RUN pnpm install --frozen-lockfile

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY

RUN BASE_PATH=/fulfill \
    VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    pnpm -F @workspace/pm-app run build

RUN pnpm -F @workspace/api-server run build

ENV NODE_ENV=production
ENV PORT=3000
ENV FRONTEND_DIST=/app/artifacts/pm-app/dist/public

CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
