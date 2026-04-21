# syntax=docker/dockerfile:1.6
#
# A11yAgent production image.
#
# The app is GUEST-DEFAULT: every route works without signing in. Sign-in
# (Email/Password, Google, GitHub) goes through Firebase Authentication
# and is entirely opt-in. Without Firebase env vars configured, the
# /signin page still renders but provider buttons error — guest mode is
# unaffected.
#
# Runtime env vars consumed by the app (all OPTIONAL unless noted):
#   Firebase (only needed for sign-in + per-user history persistence):
#     NEXT_PUBLIC_FIREBASE_API_KEY        (build-time + runtime)
#     NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN    (build-time + runtime)
#     NEXT_PUBLIC_FIREBASE_PROJECT_ID     (build-time + runtime)
#     NEXT_PUBLIC_FIREBASE_APP_ID         (build-time + runtime)
#     FIREBASE_SERVICE_ACCOUNT_JSON       inline JSON for Admin SDK; or
#     GOOGLE_APPLICATION_CREDENTIALS      path to service-account JSON.
#
#   AI providers (need at least one for /api/ai-* + /api/chat):
#     ANTHROPIC_API_KEY, GEMINI_API_KEY, ASSEMBLYAI_API_KEY
#
#   Rate limiting + scan cache + scan history:
#     UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
#
#   IBM Equal Access (on by default — requires Chromium, baked in below):
#     IBM_CHECKER_ENABLED=false   (set to disable, e.g. on tiny instances)
#
# ── Stage 1: Install ALL deps & build ───────────────────────────────
FROM node:20-bookworm-slim AS builder

# Native build chain for any node-gyp deps (kept lean — better-sqlite3
# only ships in devDependencies for the migration script and is no
# longer in the runtime path).
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --include=dev

COPY . .

# Firebase web config is inlined at build time by Next.js, so the
# NEXT_PUBLIC_* vars must be available during `next build`.
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID
ENV NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY
ENV NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ENV NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID
ENV NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID

ENV NODE_ENV=production
RUN npm run build

# Prune devDependencies (drops better-sqlite3, which is only used by the
# one-shot migration script that runs out-of-band).
RUN npm prune --omit=dev

# ── Stage 2: Lean production image ──────────────────────────────────
FROM node:20-bookworm-slim AS runner

# Chromium is needed by both axe-core (via puppeteer-core) and the IBM
# Equal Access checker. `fonts-liberation` keeps text rendering accurate
# when axe inspects layout/contrast.
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
# lib/upstash, lib/firebase/* etc. flow through automatically).
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Production node_modules for native + serverExternalPackages
# (firebase-admin, accessibility-checker, axe-core, puppeteer-core,
# @sparticuz/chromium, isomorphic-dompurify, @upstash/*, zod) which the
# Next.js standalone tracer cannot inline.
COPY --from=builder /app/node_modules ./node_modules

# Extension bundles served at runtime.
COPY --from=builder /app/extensions ./extensions

EXPOSE 3000

# A simple health probe for orchestrators (Render, Fly, k8s, etc.).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/', r => process.exit(r.statusCode<500?0:1)).on('error', () => process.exit(1))"

CMD ["node", "server.js"]
