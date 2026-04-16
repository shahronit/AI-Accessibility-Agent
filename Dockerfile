# ── Stage 1: Install ALL deps & build ────────────────────────────────
FROM node:20-bookworm-slim AS builder

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

# Prune devDependencies so only production deps remain for the runner
RUN npm prune --omit=dev

# ── Stage 2: Lean production image ──────────────────────────────────
FROM node:20-bookworm-slim AS runner

RUN apt-get update && apt-get install -y --no-install-recommends \
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

# Standalone output already bundles most code; copy it first
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy production node_modules for native/external packages
# (better-sqlite3, pdfkit, axe-core, etc. that standalone can't inline)
COPY --from=builder /app/node_modules ./node_modules

# Extension files used at runtime
COPY --from=builder /app/extensions ./extensions

RUN mkdir -p /app/data

EXPOSE 3000

CMD ["node", "server.js"]
