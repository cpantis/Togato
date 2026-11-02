FROM node:22-slim AS build
WORKDIR /app
ARG API_INTERNAL_URL
ENV API_INTERNAL_URL=$API_INTERNAL_URL
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace @togato/web --workspace @togato/shared --include-workspace-root
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build -w @togato/shared && npm run build -w @togato/web

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static apps/web/.next/static
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
