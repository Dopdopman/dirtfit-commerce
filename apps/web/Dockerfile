# syntax=docker/dockerfile:1.7

# ---- Stage 1: Prune monorepo for @dirtfit/web ----
FROM node:22-alpine AS pruner
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate
WORKDIR /app
COPY . .
RUN pnpm dlx turbo@2.11.13 prune @dirtfit/web --docker

# ---- Stage 2: Install dependencies & build Next.js standalone bundle ----
FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate
WORKDIR /app

COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile

COPY --from=pruner /app/out/full/ .

ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ARG NEXT_PUBLIC_CDN_URL=https://cdn.dirtfit.vn
ARG NEXT_PUBLIC_APP_NAME=DirtFit Commerce
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_CDN_URL=${NEXT_PUBLIC_CDN_URL}
ENV NEXT_PUBLIC_APP_NAME=${NEXT_PUBLIC_APP_NAME}
ENV NEXT_OUTPUT_STANDALONE=true
ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm --filter @dirtfit/web build

# ---- Stage 3: Minimal Non-Root Runtime ----
FROM node:22-alpine AS runner
RUN apk add --no-cache tini \
  && addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/web/server.js"]
