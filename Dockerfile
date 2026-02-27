FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@10.28.1 --activate
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/utils/package.json packages/utils/package.json
COPY packages/firebase/package.json packages/firebase/package.json
RUN pnpm install --frozen-lockfile

# Build client
FROM deps AS client-build
COPY . .
ARG EXPO_PUBLIC_APP_ENV=staging
ARG EXPO_PUBLIC_API_BASE_URL
ARG EXPO_PUBLIC_CANONICAL_ORIGIN
ARG EXPO_PUBLIC_FIREBASE_API_KEY
ARG EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG EXPO_PUBLIC_FIREBASE_PROJECT_ID
ARG EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET
ARG EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ARG EXPO_PUBLIC_FIREBASE_APP_ID
ARG EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY
ARG EXPO_PUBLIC_SENTRY_DSN
RUN pnpm -C client build

# Production image
FROM base AS production

# Security: run as non-root user
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs skatehubba

COPY --from=deps --chown=skatehubba:nodejs /app/node_modules ./node_modules
COPY --from=deps --chown=skatehubba:nodejs /app/server/node_modules ./server/node_modules
COPY --from=deps --chown=skatehubba:nodejs /app/packages ./packages
COPY --from=client-build --chown=skatehubba:nodejs /app/client/dist ./client/dist
COPY --chown=skatehubba:nodejs server ./server
COPY --chown=skatehubba:nodejs packages ./packages
COPY --chown=skatehubba:nodejs migrations ./migrations
COPY --chown=skatehubba:nodejs drizzle.config.ts tsconfig.json ./

ENV NODE_ENV=production

# Drop to non-root user
USER skatehubba

EXPOSE 3001

# Container health check — verifies the process can serve requests
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3001/api/health/live',{signal:AbortSignal.timeout(3000)}).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "--import", "tsx", "server/index.ts"]
