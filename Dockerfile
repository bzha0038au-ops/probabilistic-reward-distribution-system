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
COPY packages/user-core/package.json packages/user-core/package.json

RUN pnpm install --frozen-lockfile

FROM deps AS source

COPY . .

FROM source AS build-backend

RUN pnpm --dir apps/backend build

FROM source AS build-frontend

ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm --dir apps/frontend build

FROM source AS build-admin

RUN pnpm --dir apps/admin build

FROM deps AS backend

ENV NODE_ENV=production
ENV PORT=4000

WORKDIR /app

COPY --chown=node:node . .
COPY --from=build-backend --chown=node:node /app/apps/backend/dist apps/backend/dist
RUN chmod +x deploy/scripts/container-entrypoint.sh

EXPOSE 4000

USER node
ENTRYPOINT ["/app/deploy/scripts/container-entrypoint.sh"]
CMD ["pnpm", "--dir", "apps/backend", "start"]

FROM deps AS frontend

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

COPY --chown=node:node . .
COPY --from=build-frontend --chown=node:node /app/apps/frontend/.next apps/frontend/.next
RUN chmod +x deploy/scripts/container-entrypoint.sh

EXPOSE 3000

USER node
ENTRYPOINT ["/app/deploy/scripts/container-entrypoint.sh"]
CMD ["pnpm", "--dir", "apps/frontend", "start"]

FROM deps AS admin

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

WORKDIR /app

COPY --chown=node:node . .
COPY --from=build-admin --chown=node:node /app/apps/admin/build apps/admin/build
RUN chmod +x deploy/scripts/container-entrypoint.sh

EXPOSE 3000

USER node
ENTRYPOINT ["/app/deploy/scripts/container-entrypoint.sh"]
CMD ["pnpm", "--dir", "apps/admin", "start"]
