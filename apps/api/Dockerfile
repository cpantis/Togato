FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN npm ci --workspace @togato/api --workspace @togato/shared --include-workspace-root
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @togato/shared && npm run build -w @togato/api

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/packages/shared packages/shared
COPY --from=build /app/apps/api apps/api
WORKDIR /app/apps/api
EXPOSE 8080
CMD ["npm", "start"]
