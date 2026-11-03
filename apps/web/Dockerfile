# syntax=docker/dockerfile:1.7
#   docker build -f apps/web/Dockerfile --build-arg API_INTERNAL_URL=http://api:8080 -t togato-web .
FROM node:26-slim AS build
WORKDIR /app
ARG API_INTERNAL_URL
ARG NEXT_PUBLIC_CONTACT_EMAIL
ENV API_INTERNAL_URL=$API_INTERNAL_URL NEXT_PUBLIC_CONTACT_EMAIL=$NEXT_PUBLIC_CONTACT_EMAIL NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace @togato/web --workspace @togato/shared --include-workspace-root
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build -w @togato/shared && npm run build -w @togato/web

FROM node:26-slim AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static apps/web/.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
