# 🐳 Dockerfile สำหรับ TBKK SOC Systems
# Multi-stage build: build frontend ก่อน → serve ด้วย nginx + email server แยก process

# ========== Stage 1: Build frontend ==========
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files
COPY package*.json ./
# ต้องใช้ npm install (ไม่ใช่ npm ci) — rollup ต้องการ native binary ของ Linux
RUN npm install --include=optional

# Copy source + build (use .env.docker for localhost URLs)
COPY . .
RUN cp .env.docker .env
RUN npm run build

# ========== Stage 2: Production image ==========
FROM node:20-alpine
WORKDIR /app

# Install nginx for serving frontend
RUN apk add --no-cache nginx supervisor

# Copy built frontend → nginx serve
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy email server source
COPY --from=builder /app/server /app/server
COPY --from=builder /app/package.json /app/

# Install only production deps สำหรับ email server
RUN cd /app && npm install --omit=dev --omit=optional

# Copy nginx config + supervisord config
COPY docker/nginx.conf /etc/nginx/http.d/default.conf
COPY docker/supervisord.conf /etc/supervisord.conf

# Expose ports
EXPOSE 3000 3001

# Run supervisord (manages nginx + email server)
CMD ["supervisord", "-c", "/etc/supervisord.conf"]
