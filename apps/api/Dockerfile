# syntax=docker/dockerfile:1.7

# ---- Stage 1: Prune monorepo for @dirtfit/api ----
FROM node:22-alpine AS pruner
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate
WORKDIR /app
COPY . .
RUN pnpm dlx turbo@2.11.13 prune @dirtfit/api --docker

# ---- Stage 2: Install production dependencies & generate Prisma Client ----
FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat openssl python3 make g++
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate
WORKDIR /app

COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile --prod

COPY --from=pruner /app/out/full/ .

# Install Prisma CLI in an isolated prefix to keep root node_modules lean, then generate client
RUN npm install --prefix /opt/prisma-cli --no-save prisma@6.19.3 \
  && /opt/prisma-cli/node_modules/.bin/prisma generate --schema=apps/api/prisma/schema.prisma

# ---- Stage 3: Production Runtime (Non-Root, Tini, Node Fetch Healthcheck) ----
FROM node:22-alpine AS runner
RUN apk add --no-cache openssl tini \
  && addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 dirtfit

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000
ENV HOST=0.0.0.0
ENV RUN_MIGRATIONS=false
ENV RUN_SEED=false

COPY --from=builder --chown=dirtfit:nodejs /app/package.json ./package.json
COPY --from=builder --chown=dirtfit:nodejs /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder --chown=dirtfit:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=dirtfit:nodejs /app/packages ./packages
COPY --from=builder --chown=dirtfit:nodejs /app/apps/api ./apps/api
COPY --from=builder --chown=dirtfit:nodejs /opt/prisma-cli /opt/prisma-cli

USER dirtfit
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 4000) + '/health/live').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/api/scripts/entrypoint.mjs"]
