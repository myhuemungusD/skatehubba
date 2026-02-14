FROM node:20-slim AS base
RUN corepack enable && corepack prepare pnpm@10.28.1 --activate
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
COPY web/package.json web/package.json
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
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/server/node_modules ./server/node_modules
COPY --from=deps /app/packages ./packages
COPY --from=client-build /app/client/dist ./client/dist
COPY server ./server
COPY packages ./packages
COPY migrations ./migrations
COPY drizzle.config.ts tsconfig.json ./

ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "--import", "tsx", "server/index.ts"]
