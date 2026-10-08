# Build context: the gui/ directory.
#   docker build -t docker-registry-panel gui/
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
LABEL org.opencontainers.image.title="Docker Registry Panel" \
      org.opencontainers.image.description="Web UI for private Docker registries: browse repos and tags, inspect layers, delete by digest." \
      org.opencontainers.image.source="https://github.com/nikodips-tech/docker-registry-panel" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.url="https://hub.docker.com/r/dipstech/docker-registry-panel"
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.output ./.output
ENV PORT=3000
ENV HOST=0.0.0.0
EXPOSE 3000
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:3000/api/registry/health >/dev/null || exit 1
CMD ["node", ".output/server/index.mjs"]
