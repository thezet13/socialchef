FROM node:20-bookworm-slim

WORKDIR /app

# pnpm
RUN corepack enable

# Copy workspace manifests first for better caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps/web ./apps/web

RUN pnpm install --frozen-lockfile

WORKDIR /app/apps/web
EXPOSE 3000

CMD ["pnpm", "dev", "--", "-p", "3000", "-H", "0.0.0.0"]