# syntax=docker/dockerfile:1

# =============================================================================
# SafeOS Guardian - container build
#
# Backend: the package is ESM ("type":"module") with bundler-style extensionless
# imports (tsconfig moduleResolution: "bundler"), so the compiled dist/ is NOT
# directly runnable by `node` (it throws ERR_MODULE_NOT_FOUND on the first
# relative import). The supported runtime path is `tsx`, which is exactly what
# `npm run dev` uses. The backend image runs the TypeScript sources through tsx.
#
# Frontend: apps/guardian-ui is a Next.js static export (output: 'export'), so
# `next build` emits out/ and it is served by nginx. `next start` does not serve
# an exported app and is not used here.
# =============================================================================

# -----------------------------------------------------------------------------
# base: Node 20 + toolchain for native modules (better-sqlite3, sharp)
# -----------------------------------------------------------------------------
FROM node:20-alpine AS base
RUN apk add --no-cache python3 make g++ sqlite-dev
WORKDIR /app

# -----------------------------------------------------------------------------
# deps: install backend (root) dependencies, including devDeps (tsx, typescript)
# Do not set NODE_ENV=production here, or npm would prune tsx and the backend
# would have no runtime.
# -----------------------------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps

# -----------------------------------------------------------------------------
# backend: runtime image - runs src/ via tsx
# -----------------------------------------------------------------------------
FROM node:20-alpine AS backend
WORKDIR /app
# Runtime libraries for the better-sqlite3 / sharp native bindings
RUN apk add --no-cache sqlite-libs libstdc++
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src ./src
RUN mkdir -p /app/db_data
ENV NODE_ENV=production \
    SAFEOS_PORT=3001 \
    SAFEOS_DB_PATH=/app/db_data/safeos.sqlite3
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=5 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1
# tsx runs the ESM TypeScript directly. Run the API server entry, which
# self-starts via its import.meta main-guard. Compose sets `init: true` so tini
# forwards SIGTERM to the process for the server's graceful-shutdown handler.
CMD ["npx", "tsx", "src/api/server.ts"]

# -----------------------------------------------------------------------------
# builder-frontend: build the Next.js static export (out/)
# The export is plain HTML, CSS and JS, the same for every platform, so this
# stage runs on the build machine's own platform: a multi-platform build
# (linux/amd64 and linux/arm64) compiles it once, natively, instead of under
# emulation.
# -----------------------------------------------------------------------------
FROM --platform=$BUILDPLATFORM node:20-alpine AS builder-frontend
RUN apk add --no-cache python3 make g++
WORKDIR /app/apps/guardian-ui
COPY apps/guardian-ui/package.json apps/guardian-ui/package-lock.json* ./
RUN npm install --legacy-peer-deps
# NEXT_PUBLIC_* are inlined at build time, so the API/WS URLs the browser uses
# must be passed as build args (not runtime env).
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ARG NEXT_PUBLIC_WS_URL=ws://localhost:3001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production
COPY apps/guardian-ui ./
RUN npm run build

# -----------------------------------------------------------------------------
# frontend: nginx serving the static export on :3000
# -----------------------------------------------------------------------------
FROM nginx:alpine AS frontend
RUN rm -f /etc/nginx/conf.d/default.conf
COPY docker/nginx-guardian-ui.conf /etc/nginx/conf.d/guardian-ui.conf
COPY --from=builder-frontend /app/apps/guardian-ui/out /usr/share/nginx/html
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

# -----------------------------------------------------------------------------
# development: full stack with hot reload (api + ui via concurrently)
# -----------------------------------------------------------------------------
FROM base AS development
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps
COPY apps/guardian-ui/package.json ./apps/guardian-ui/
RUN cd apps/guardian-ui && npm install --legacy-peer-deps
COPY . .
ENV NODE_ENV=development \
    SAFEOS_PORT=3001
EXPOSE 3000 3001
CMD ["npm", "run", "dev"]
