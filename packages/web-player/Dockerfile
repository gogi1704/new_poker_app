# Build context must be the repo root (needs the pnpm workspace files).
FROM node:22-alpine AS builder
RUN corepack enable
WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/api/package.json packages/api/package.json
COPY packages/bot/package.json packages/bot/package.json
COPY packages/web-player/package.json packages/web-player/package.json
COPY packages/web-td/package.json packages/web-td/package.json
RUN pnpm install --frozen-lockfile

COPY packages/web-player packages/web-player

# Empty string (not unset) makes api.ts's `?? "http://localhost:3001"`
# fallback not apply, so requests go out as same-origin relative paths —
# nginx below proxies /api/ to the api container.
ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN pnpm --filter @poker/web-player build

FROM nginx:1.27-alpine
COPY --from=builder /app/packages/web-player/dist /usr/share/nginx/html
COPY packages/web-player/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
