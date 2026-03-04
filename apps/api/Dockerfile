FROM node:20-bookworm-slim AS base
WORKDIR /app
RUN corepack enable
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# deps
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages ./packages
RUN pnpm install --frozen-lockfile

# build
FROM deps AS build
COPY . .
RUN pnpm --filter @socialchef/shared build \
 && pnpm --filter @socialchef/pro-fonts build \
 && pnpm --filter socialchef-api build

# prod
FROM node:20-bookworm-slim AS prod
WORKDIR /app
RUN corepack enable
# ✅ ВОТ ЭТОГО НЕ ХВАТАЛО:
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/api ./apps/api

WORKDIR /app/apps/api
EXPOSE 4000
CMD ["pnpm", "start"]
