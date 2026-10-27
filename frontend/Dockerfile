# ==============================================================================
# ATC Vision — Frontend Dockerfile (Multi-Stage Build)
# ==============================================================================

# Stage 1: Build static assets
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies with lockfile cache
COPY package.json package-lock.json ./
RUN npm ci

# Copy source code and build
COPY . .
RUN npm run build

# Stage 2: Serve with lightweight Nginx
FROM nginx:1.27-alpine AS runner

# Remove default nginx configs
RUN rm -rf /etc/nginx/conf.d/* /usr/share/nginx/html/*

# Copy custom Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy compiled assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose internal port 8080 (Docker Compose maps this to 8085 on the host)
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:8080/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
