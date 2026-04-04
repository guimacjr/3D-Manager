FROM node:20-bookworm-slim AS build
WORKDIR /app

COPY mobile/package*.json ./
RUN npm ci

COPY mobile/app.json ./app.json
COPY mobile/babel.config.js ./babel.config.js
COPY mobile/tsconfig.json ./tsconfig.json
COPY mobile/App.tsx ./App.tsx
COPY mobile/src ./src

ARG EXPO_PUBLIC_API_URL=/api
ENV EXPO_PUBLIC_API_URL=${EXPO_PUBLIC_API_URL}

RUN npx expo export --platform web

FROM nginx:1.27-alpine AS runtime
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
