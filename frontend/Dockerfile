FROM node:22-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/
RUN npm ci --workspace=@product-researcher/frontend --include-workspace-root

FROM deps AS build
COPY frontend ./frontend
RUN npm run build -w @product-researcher/frontend

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/frontend/build ./frontend/build
EXPOSE 3001
CMD ["node", "frontend/build/index.js"]
