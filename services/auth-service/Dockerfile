# syntax=docker/dockerfile:1
FROM node:20-alpine AS base
WORKDIR /app

# Copy manifest(s); package-lock.json is optional so use a wildcard
COPY package*.json ./

# Install dependencies. Use npm ci when lockfile exists for reproducibility; fallback to npm install otherwise.
RUN if [ -f package-lock.json ]; then npm ci --only=production || npm ci; else npm install --production; fi

# Copy source code after dependencies to leverage cached layers
COPY . .

EXPOSE 8081
CMD ["npm", "start"]
