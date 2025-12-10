# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install FFmpeg for video processing (optional, for segmenting videos in container)
RUN apk add --no-cache ffmpeg

# Copy node modules from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application files
COPY package*.json ./
COPY server.js ./
COPY public ./public

# Create segments directory (can be overridden with volume mount)
RUN mkdir -p segments

# Copy default segments if they exist (optional)
COPY segments ./segments

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV DEMO_MODE=false

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

# Run the server
CMD ["node", "server.js"]
