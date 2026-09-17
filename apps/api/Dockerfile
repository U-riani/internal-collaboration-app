FROM node:24-alpine

RUN apk add --no-cache openssl libc6-compat
WORKDIR /app

COPY apps/api/package*.json ./
RUN npm ci --omit=dev --registry=https://registry.npmjs.org/

COPY apps/api/prisma ./prisma
RUN npx prisma generate

COPY apps/api/src ./src
COPY apps/api/scripts ./scripts

EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && node prisma/seed.js && node src/server.js"]
