# syntax=docker/dockerfile:1
FROM node:20-alpine AS base
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

EXPOSE 8081
CMD ["npm", "start"]
