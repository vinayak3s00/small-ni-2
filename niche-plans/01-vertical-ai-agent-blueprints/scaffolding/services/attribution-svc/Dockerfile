# Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
# Abetworks Proprietary and Confidential.
#
# Multi-stage build for attribution-svc.
# IMPORTANT: build context is the REPOSITORY ROOT (see docker-compose.yaml).
FROM node:22-alpine AS build
WORKDIR /workspace

ARG SVC=niche-plans/01-vertical-ai-agent-blueprints/scaffolding/services/attribution-svc
ARG CORE=niche-plans/00-platform-baseline/packages/core

COPY ${CORE} /workspace/packages/core
RUN cd /workspace/packages/core && npm install && npm run build

COPY ${SVC} /workspace/service
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
EXPOSE 3011
CMD ["node", "dist/server.js"]
