# syntax=docker.io/docker/dockerfile:1
# ============================================================
# Coolify multi-stage build — Next.js 16 standalone
# Secret-free build (source map upload .github/workflows/sentry-release.yml'da)
# ============================================================

FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

# ── deps stage: yalnız package.json + lockfile, bağımlılık kurulumu ──
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ── builder stage: kaynağı kopyala + build ──
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Yalnızca NEXT_PUBLIC_* build-time gerekli; Next bunları bundle'a inject eder.
# Server-side secret'ları (SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY, vb.)
# runtime'da Coolify env panel'inden enjekte edilir; image'a YAZILMAZ.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_SENTRY_ENVIRONMENT
ARG NEXT_PUBLIC_APP_URL

ENV NEXT_TELEMETRY_DISABLED=1

# Sentry source map upload bu adımda YAPILMAZ.
# next.config.ts'deki `silent: !process.env.SENTRY_AUTH_TOKEN` kuralı token yokken
# upload'ı atlatır; source maps üretilir, runtime için gerek yok ama sentry-release.yml
# CI workflow'u source map upload yapar (Docker dışında, secret-safe).
RUN npm run build

# ── runner stage: minimal Node server ──
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0

# server.js standalone build tarafından üretilir
CMD ["node", "server.js"]
