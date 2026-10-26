# Build context must be the repo root (needs the pnpm workspace files).
FROM node:22-alpine
RUN corepack enable
WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/api/package.json packages/api/package.json
COPY packages/bot/package.json packages/bot/package.json
COPY packages/web-player/package.json packages/web-player/package.json
COPY packages/web-td/package.json packages/web-td/package.json
RUN pnpm install --frozen-lockfile

COPY packages/shared packages/shared
COPY packages/api packages/api

RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app

ENV NODE_ENV=production
WORKDIR /app/packages/api
EXPOSE 3001
CMD ["pnpm", "exec", "tsx", "src/index.ts"]
