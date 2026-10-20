FROM node:24.21.0-bookworm-slim AS dependencies
WORKDIR /workspace
RUN npm install --global pnpm@11.19.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
ENV npm_config_fetch_timeout=300000 npm_config_fetch_retries=5
RUN --mount=type=cache,target=/root/.local/share/pnpm/store/v11 pnpm install --frozen-lockfile --network-concurrency=8

FROM dependencies AS build
COPY apps/web apps/web
COPY docs/audit docs/audit
COPY scripts/web-runtime.mjs scripts/web-runtime.mjs
ENV NEXT_PUBLIC_API_MODE=backend NEXT_PUBLIC_BANKING_API_BASE_URL=/ NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS=--max-old-space-size=768
RUN pnpm build

FROM node:24.21.0-trixie-slim AS runtime
ARG ASTER_SOURCE_SHA256=unknown
LABEL io.aster.source.sha256=$ASTER_SOURCE_SHA256
WORKDIR /app
# The standalone server needs Node, not npm/yarn or their package-management dependencies.
RUN rm -rf /usr/local/lib/node_modules/npm /opt/yarn-* /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/yarn /usr/local/bin/yarnpkg
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /workspace/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /workspace/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /workspace/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
