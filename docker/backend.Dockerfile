FROM node:20-bookworm-slim AS deps
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY backend/package*.json ./
RUN npm ci

FROM deps AS build
COPY backend/tsconfig.json ./tsconfig.json
COPY backend/src ./src
RUN npm run build
RUN npm prune --omit=dev

FROM node:20-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3333
ENV DB_PATH=/data/data.sqlite
ENV MEDIA_ROOT=/data/storage/media

COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY backend/package.json ./package.json
COPY backend/migrations ./migrations

RUN mkdir -p /data/storage/media

EXPOSE 3333
CMD ["node", "dist/index.js"]
