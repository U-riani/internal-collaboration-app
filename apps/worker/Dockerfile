FROM node:24-alpine

RUN apk add --no-cache openssl libc6-compat
WORKDIR /app

COPY apps/worker/package*.json ./
RUN npm ci --omit=dev --registry=https://registry.npmjs.org/
COPY apps/worker/prisma ./prisma
RUN npx prisma generate
COPY apps/worker/src ./src

CMD ["node", "src/worker.js"]
