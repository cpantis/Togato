# syntax=docker/dockerfile:1.7
# Imaginea API + worker (aceeași imagine; comanda diferă). Construită din rădăcina monorepo-ului:
#   docker build -f apps/api/Dockerfile -t togato-api .
FROM node:22-slim AS base
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/

# dependențele de producție (fără vitest, drizzle-kit, tsx, typescript)
FROM base AS prod-deps
RUN npm ci --omit=dev --workspace @togato/api --workspace @togato/shared --include-workspace-root --ignore-scripts && npm cache clean --force

FROM base AS build
RUN npm ci --workspace @togato/api --workspace @togato/shared --include-workspace-root
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @togato/shared && npm run build -w @togato/api

FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps --chown=node:node /app/node_modules node_modules
COPY --from=build --chown=node:node /app/packages/shared/package.json packages/shared/package.json
COPY --from=build --chown=node:node /app/packages/shared/dist packages/shared/dist
COPY --from=build --chown=node:node /app/apps/api/package.json apps/api/package.json
COPY --from=build --chown=node:node /app/apps/api/dist apps/api/dist
# resurse citite la rulare: textul legii, fonturile PDF, migrațiile SQL
COPY --from=build --chown=node:node /app/apps/api/src/legal apps/api/src/legal
COPY --from=build --chown=node:node /app/apps/api/src/assets apps/api/src/assets
COPY --from=build --chown=node:node /app/apps/api/src/db/migrations apps/api/src/db/migrations
WORKDIR /app/apps/api
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# migrațiile rulează separat, înainte de lansare: node dist/db/migrate.js
# worker: node dist/worker.js
CMD ["node", "dist/index.js"]
