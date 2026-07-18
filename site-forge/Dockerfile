FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY . .

RUN mkdir -p /var/lib/site-forge/data /var/lib/site-forge/workspaces \
  && chown -R node:node /app /var/lib/site-forge

USER node
ENV NODE_ENV=production \
    SITEFORGE_HOST=0.0.0.0 \
    SITEFORGE_PORT=8787 \
    SITEFORGE_DATA_DIR=/var/lib/site-forge/data \
    SITEFORGE_WORKSPACE_DIR=/var/lib/site-forge/workspaces

EXPOSE 8787
CMD ["node", "src/server.mjs"]
