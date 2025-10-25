# syntax=docker/dockerfile:1
FROM node:20-alpine AS base
WORKDIR /app

# Copy only dependency manifests for better caching
COPY package.json package-lock.json ./

# Install exact dependencies using lockfile
RUN npm ci --only=production || npm ci

# Copy source code after dependencies to leverage cached layers
COPY . .

EXPOSE 8081
CMD ["npm", "start"]
