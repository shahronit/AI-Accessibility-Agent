# syntax=docker/dockerfile:1.6
#
# A11yAgent production image.
#
# The app is GUEST-DEFAULT: every route works without signing in, so all
# auth-related env vars are optional. The only env var that materially
# affects boot is NEXTAUTH_SECRET, because NextAuth still loads at runtime
# (it just no longer gates anything) and needs a secret to decode session
# cookies for users who do opt to sign in.
#
# Runtime env vars consumed by the app (all OPTIONAL unless noted):
#   Auth (all optional — sign-in is opt-in):
#     NEXTAUTH_SECRET   recommended in prod; generate with `openssl rand -base64 32`.
#                       Without it NextAuth logs a warning and falls back to a
#                       random per-boot secret, which invalidates sign-in
#                       sessions on every restart.
#     GITHUB_ID, GITHUB_SECRET, NEXTAUTH_URL
#                       only needed if you want the /signin GitHub button to
#                       work. With them unset, /signin still renders but the
#                       button fails — guest mode is unaffected.
#   AI providers (need at least one for /api/ai-* + /api/chat):
#     ANTHROPIC_API_KEY, GEMINI_API_KEY, ASSEMBLYAI_API_KEY
#   Rate limiting + scan cache + scan history:
#     UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
#   IBM Equal Access (on by default — requires Chromium, baked in below):
#     IBM_CHECKER_ENABLED=false   (set to disable, e.g. on tiny instances)
#   Multi-page scan persistence (SQLite):
#     DB_PATH=/app/data/a11yagent.db   (default; mount a volume for persistence)
#
# ── Stage 1: Install ALL deps & build ───────────────────────────────
FROM node:20-bookworm-slim AS builder

# Native build chain for better-sqlite3 and any other node-gyp deps.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --include=dev

COPY . .

ENV NODE_ENV=production
RUN npm run build

# Prune devDependencies so only production deps remain for the runner stage.
RUN npm prune --omit=dev

# ── Stage 2: Lean production image ──────────────────────────────────
FROM node:20-bookworm-slim AS runner

# Chromium is needed by both axe-core (via puppeteer-core) and the IBM
# Equal Access checker (Fix 5). `fonts-liberation` keeps text rendering
# accurate when axe inspects layout/contrast.
RUN mkdir -p /usr/share/man/man1 \
    && apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    ca-certificates \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

WORKDIR /app

# Standalone output already bundles most application code (the new
# lib/schemas, lib/validate-request, lib/ssrf-guard, lib/scan-store,
# lib/upstash, etc. flow through automatically).
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Production node_modules for native + serverExternalPackages
# (better-sqlite3, accessibility-checker, axe-core, puppeteer-core,
# @sparticuz/chromium, isomorphic-dompurify, @upstash/*, zod) which the
# Next.js standalone tracer cannot inline.
COPY --from=builder /app/node_modules ./node_modules

# Extension bundles served at runtime.
COPY --from=builder /app/extensions ./extensions

# DB_PATH default lives here; mount a volume to persist multi-page scans.
RUN mkdir -p /app/data

EXPOSE 3000

# A simple health probe for orchestrators (Render, Fly, k8s, etc.).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/', r => process.exit(r.statusCode<500?0:1)).on('error', () => process.exit(1))"

CMD ["node", "server.js"]
