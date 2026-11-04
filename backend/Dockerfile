FROM node:20-alpine

WORKDIR /app

# Install dependencies first, separately from app code, so Docker can cache
# this layer and skip reinstalling on every code change.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 4000

# Migrations run automatically on startup (see server.js) — no separate
# migration step needed here.
CMD ["node", "server.js"]
