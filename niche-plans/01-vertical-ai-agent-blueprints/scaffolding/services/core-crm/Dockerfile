# Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
# Abetworks Proprietary and Confidential.
#
# Multi-stage build for the core-crm service.
# IMPORTANT: build context is the REPOSITORY ROOT (see docker-compose.yaml),
# so the shared @abetworks/core library is available to COPY and build.
FROM node:22-alpine AS build
WORKDIR /workspace

ARG SVC=niche-plans/01-vertical-ai-agent-blueprints/scaffolding/services/core-crm
ARG CORE=niche-plans/00-platform-baseline/packages/core

# Shared library (file: dependency) must be present and built first.
COPY ${CORE} /workspace/packages/core
RUN cd /workspace/packages/core && npm install && npm run build

# Service sources.
COPY ${SVC} /workspace/service
# Repoint the file: dependency at the copied lib location, then build.
RUN cd /workspace/service \
    && npm pkg set dependencies.@abetworks/core=file:/workspace/packages/core \
    && npm install \
    && npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /workspace/service/dist ./dist
COPY --from=build /workspace/service/migrations ./migrations
COPY --from=build /workspace/service/node_modules ./node_modules
COPY --from=build /workspace/service/package.json ./package.json
EXPOSE 3001
CMD ["node", "dist/server.js"]
