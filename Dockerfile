# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root package files
COPY package*.json ./
COPY package-lock.json ./

# Install root dependencies
RUN npm ci

# Copy server package files and install
COPY server/package*.json ./server/
RUN cd server && npm ci && cd ..

# Copy source code
COPY . .

# Build frontend
RUN npm run build

# Verify build
RUN ls -la dist/ && ls -la dist/assets/

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy everything needed
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/data ./data
COPY --from=builder /app/node_modules ./node_modules

# Install server dependencies
WORKDIR /app/server
RUN npm ci --only=production

# Go back to app root
WORKDIR /app

# Expose port
EXPOSE 3100

# Set environment
ENV NODE_ENV=production
ENV PORT=3100

# Start server from app root
CMD ["node", "server/server.js"]