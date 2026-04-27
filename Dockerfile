FROM node:20-bookworm-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable && corepack prepare pnpm@10.31.0 --activate

WORKDIR /app

FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/admin/package.json apps/admin/package.json
COPY apps/backend/package.json apps/backend/package.json
COPY apps/database/package.json apps/database/package.json
COPY apps/frontend/package.json apps/frontend/package.json
COPY apps/mobile/package.json apps/mobile/package.json
COPY apps/shared-types/package.json apps/shared-types/package.json
COPY packages/prize-engine-sdk/package.json packages/prize-engine-sdk/package.json
COPY packages/user-core/package.json packages/user-core/package.json

RUN pnpm install --frozen-lockfile

FROM deps AS source

COPY . .

FROM source AS build-backend

RUN pnpm --dir apps/shared-types build && pnpm --dir apps/database build
RUN pnpm --dir apps/backend build

FROM source AS deploy-backend

COPY --from=build-backend /app/apps/shared-types/dist apps/shared-types/dist
COPY --from=build-backend /app/apps/database/dist apps/database/dist
COPY --from=build-backend /app/apps/backend/dist apps/backend/dist

RUN pnpm --filter @reward/backend deploy --legacy --prod /opt/backend \
 && rm -rf /opt/backend/dist/integration /opt/backend/src/integration /opt/backend/src/tests \
 && rm -f /opt/backend/scripts/check-prize-engine-tenant-scope.ts \
 && rm -f /opt/backend/vitest.config.ts /opt/backend/vitest.integration.config.ts

FROM source AS build-frontend

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN pnpm --dir apps/frontend build

FROM source AS build-admin

RUN pnpm --dir apps/shared-types build && pnpm --dir apps/admin build

FROM source AS deploy-admin

COPY --from=build-admin /app/apps/shared-types/dist apps/shared-types/dist
COPY --from=build-admin /app/apps/admin/build apps/admin/build

RUN pnpm --filter ./apps/admin deploy --legacy --prod /opt/admin
RUN find /opt/admin/build -name '*.map' -delete

FROM base AS backend

ENV NODE_ENV=production
ENV PORT=4000

WORKDIR /app

COPY --from=deploy-backend --chown=node:node /opt/backend apps/backend
COPY --from=source --chown=node:node /app/deploy deploy
RUN ln -s /app/apps/backend/node_modules/@reward/database apps/database \
 && chmod +x deploy/scripts/container-entrypoint.sh

EXPOSE 4000

USER node
ENTRYPOINT ["/app/deploy/scripts/container-entrypoint.sh"]
CMD ["pnpm", "--dir", "apps/backend", "start"]

FROM base AS frontend

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

WORKDIR /app

COPY --from=build-frontend --chown=node:node /app/apps/frontend/.next/standalone ./
COPY --from=build-frontend --chown=node:node /app/apps/frontend/.next/static apps/frontend/.next/static
COPY --from=build-frontend --chown=node:node /app/apps/frontend/public apps/frontend/public
COPY --from=source --chown=node:node /app/deploy deploy
RUN chmod +x deploy/scripts/container-entrypoint.sh

EXPOSE 3000

USER node
ENTRYPOINT ["/app/deploy/scripts/container-entrypoint.sh"]
CMD ["node", "apps/frontend/server.js"]

FROM base AS admin

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

WORKDIR /app

COPY --from=deploy-admin --chown=node:node /opt/admin apps/admin
COPY --from=source --chown=node:node /app/deploy deploy
RUN chmod +x deploy/scripts/container-entrypoint.sh

EXPOSE 3000

USER node
ENTRYPOINT ["/app/deploy/scripts/container-entrypoint.sh"]
CMD ["pnpm", "--dir", "apps/admin", "start"]
