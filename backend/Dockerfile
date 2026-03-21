FROM node:22-alpine AS base
WORKDIR /app

# Install dependencies for both workspaces
FROM base AS deps
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
RUN npm ci --workspace=@product-researcher/backend --include-workspace-root

# Build
FROM deps AS build
COPY tsconfig.base.json ./
COPY backend ./backend
RUN npm run build -w @product-researcher/backend

# Production runtime
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/backend/drizzle ./backend/drizzle
EXPOSE 3000
CMD ["node", "backend/dist/index.js"]
