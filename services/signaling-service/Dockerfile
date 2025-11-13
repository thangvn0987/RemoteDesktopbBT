# syntax=docker/dockerfile:1
FROM node:20-alpine
WORKDIR /app

# Install deps
COPY package.json package-lock.json ./
RUN npm ci --only=production || npm ci

# Copy source
COPY . .

# Default WS port inside container (can be overridden by env)
ENV WS_PORT=8080
EXPOSE 8080 5555

# Start signaling bridge
CMD ["node", "server.js"]
