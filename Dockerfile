FROM node:24.22.0-bookworm-slim@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5 AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/auth-contract/package.json packages/auth-contract/package.json
RUN npm ci --no-audit --no-fund

COPY tsconfig.base.json ./
COPY packages/auth-contract/tsconfig*.json packages/auth-contract/
COPY packages/auth-contract/src packages/auth-contract/src
COPY apps/api/tsconfig*.json apps/api/
COPY apps/api/src apps/api/src
COPY apps/web/index.html apps/web/vite.config.ts apps/web/tsconfig.json apps/web/
COPY apps/web/src apps/web/src
RUN npm run build

FROM node:24.22.0-bookworm-slim@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5 AS runtime
ENV NODE_ENV=production PORT=3000
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/auth-contract/package.json packages/auth-contract/package.json
RUN npm ci --omit=dev --workspace=@easygen/api --include-workspace-root --no-audit --no-fund \
    && npm cache clean --force

COPY --from=build --chown=node:node /app/packages/auth-contract/dist packages/auth-contract/dist
COPY --from=build --chown=node:node /app/apps/api/dist apps/api/dist
COPY --from=build --chown=node:node /app/apps/web/dist apps/web/dist

USER node
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]
