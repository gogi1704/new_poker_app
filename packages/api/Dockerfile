# Build context must be the repo root (needs the pnpm workspace files).
FROM node:22-alpine
RUN corepack enable
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
# Chown the empty dir now (instant) instead of `chown -R` after node_modules
# exists (thousands of files — that single step was the slowest part of the
# whole build). Every COPY below carries its own --chown for the same reason.
RUN chown app:app /app
ENV HOME=/app

COPY --chown=app:app pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY --chown=app:app packages/shared/package.json packages/shared/package.json
COPY --chown=app:app packages/api/package.json packages/api/package.json
COPY --chown=app:app packages/bot/package.json packages/bot/package.json
COPY --chown=app:app packages/web-player/package.json packages/web-player/package.json
COPY --chown=app:app packages/web-td/package.json packages/web-td/package.json

USER app
RUN pnpm install --frozen-lockfile

COPY --chown=app:app packages/shared packages/shared
COPY --chown=app:app packages/api packages/api

ENV NODE_ENV=production
WORKDIR /app/packages/api
EXPOSE 3001
CMD ["pnpm", "exec", "tsx", "src/index.ts"]
