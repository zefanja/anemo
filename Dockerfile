# ── Build stage ───────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Production stage ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/build ./build
COPY --from=builder /app/math-knowledge-graph ./math-knowledge-graph
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/drizzle ./drizzle

EXPOSE 3000

CMD ["node", "build/index.js"]
