FROM node:24-bookworm-slim AS dependencies

WORKDIR /app/apps/api

COPY apps/api/package.json apps/api/package-lock.json ./
RUN npm ci

COPY apps/api/prisma ./prisma

# Prisma generation only needs a syntactically valid URL; no database connection is made here.
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build
RUN npm run db:generate

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app/apps/api

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=dependencies --chown=node:node /app/apps/api/node_modules ./node_modules
COPY --chown=node:node apps/api/package.json apps/api/package-lock.json ./
COPY --chown=node:node apps/api/prisma ./prisma
COPY --chown=node:node apps/api/src ./src

RUN mkdir -p /app/data/files && chown -R node:node /app

USER node

EXPOSE 3000

CMD ["sh", "-c", "npm run db:deploy && npm start"]
