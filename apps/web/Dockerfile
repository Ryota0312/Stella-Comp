ARG NODE_VERSION=24.17.0

FROM node:${NODE_VERSION}-bookworm-slim AS deps

WORKDIR /src/apps/web

RUN corepack enable

COPY apps/web/package.json apps/web/pnpm-lock.yaml apps/web/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:${NODE_VERSION}-bookworm-slim AS build

WORKDIR /src/apps/web

RUN corepack enable

ARG NEXT_PUBLIC_API_BASE_URL=/api
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}

COPY --from=deps /src/apps/web/node_modules ./node_modules
COPY apps/web ./
RUN pnpm build

FROM node:${NODE_VERSION}-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

COPY --from=build /src/apps/web/public ./public
COPY --from=build /src/apps/web/.next/static ./.next/static
COPY --from=build /src/apps/web/.next/standalone ./

EXPOSE 3000

CMD ["node", "server.js"]
