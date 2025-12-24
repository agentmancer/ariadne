# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/mobile-web/package.json ./packages/mobile-web/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source and root config
COPY tsconfig.json ./
COPY packages/shared ./packages/shared
COPY packages/mobile-web ./packages/mobile-web

# Remove stale tsbuildinfo files and build
RUN rm -f packages/*/tsconfig.tsbuildinfo
RUN pnpm --filter @ariadne/shared build
RUN pnpm --filter @ariadne/mobile-web build

# Production stage - serve static files with nginx
FROM nginx:alpine

# Copy built files
COPY --from=builder /app/packages/mobile-web/dist /usr/share/nginx/html

# Copy nginx config for SPA routing
RUN echo 'server { \
    listen 80; \
    root /usr/share/nginx/html; \
    index index.html; \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
