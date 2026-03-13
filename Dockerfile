# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY server/package*.json ./server/

# Install dependencies
RUN npm ci && cd server && npm ci && cd ..

# Copy source code
COPY . .

# Build frontend
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy server and data
COPY --from=builder /app/server ./server
COPY --from=builder /app/data ./data
COPY --from=builder /app/dist ./dist

# Install production dependencies only
WORKDIR /app/server
RUN npm ci --only=production

# Expose port
EXPOSE 3100

# Set environment
ENV NODE_ENV=production
ENV PORT=3100

# Start server
CMD ["node", "server.js"]