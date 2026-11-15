FROM node:20-slim AS builder

WORKDIR /app

# Copy dependency definitions
COPY package*.json ./

# Install dependencies (including devDependencies for tsc)
RUN npm ci

# Copy source files
COPY tsconfig.json ./
COPY src/ ./src/

# Compile TypeScript to JavaScript
RUN npm run build

# Production runtime image
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8002
ENV HOST=0.0.0.0

COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled output
COPY --from=builder /app/dist ./dist

EXPOSE 8002

CMD ["node", "dist/main.js"]

