# ---- Build stage ----
FROM node:20-alpine AS builder
WORKDIR /app

# bcrypt ships a native addon; Alpine (musl) needs a C/C++ toolchain to
# compile it during npm install if a prebuilt binary isn't available.
# openssl is required for Prisma's Rust engine binaries to run at all
# (they dynamically link against libssl; Alpine's node image doesn't
# ship it by default, which otherwise makes every `prisma` command fail).
RUN apk add --no-cache python3 make g++ openssl

COPY package*.json ./
COPY prisma ./prisma
RUN npm install

COPY . .
RUN npx prisma generate
RUN npm run build

# ---- Production stage ----
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

# openssl must remain in the final image (not removed below) — the
# entrypoint runs `prisma db push` and the seed script at container
# startup, both of which invoke Prisma's engine binaries at runtime.
RUN apk add --no-cache python3 make g++ openssl

COPY package*.json ./
COPY prisma ./prisma
COPY tsconfig.json ./tsconfig.json
RUN npm install --omit=dev && npx prisma generate

# python3/make/g++ were only needed to compile bcrypt's native addon;
# safe to drop them now to keep the final image smaller. openssl stays.
RUN apk del python3 make g++

COPY --from=builder /app/dist ./dist
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 3000
CMD ["./docker-entrypoint.sh"]
