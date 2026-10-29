FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3417 \
    HONGUO_STATE_FILE=/app/data/state.json

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
    && npm cache clean --force

COPY --chown=node:node server.js ./
COPY --chown=node:node src ./src
COPY --chown=node:node public ./public

RUN mkdir -p /app/data \
    && chown node:node /app/data

USER node

EXPOSE 3417
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3417/').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["node", "server.js"]
