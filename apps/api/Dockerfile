FROM node:26-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci

FROM deps AS builder
COPY . .
RUN DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" npx prisma generate
RUN npm run build
# Bỏ devDependencies (jest, eslint, typescript, @nestjs/cli...) trước khi chép sang image chạy thật.
# prisma và dotenv nằm trong dependencies để container vẫn chạy được `npx prisma migrate deploy`.
RUN npm prune --omit=dev

FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY package.json ./

# Chạy bằng user không có quyền root (user `node` có sẵn trong image node:*-alpine).
USER node

EXPOSE 4000
CMD ["node", "dist/main"]
