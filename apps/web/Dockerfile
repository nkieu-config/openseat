FROM node:22-bookworm-slim AS build
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/config/package.json packages/config/
COPY packages/contracts/package.json packages/contracts/
COPY services/gate/package.json services/gate/
COPY services/paymock/package.json services/paymock/
COPY tests/e2e/package.json tests/e2e/
RUN pnpm install --frozen-lockfile --filter web...
COPY apps/web apps/web
COPY packages packages
ARG API_PROXY_TARGET=http://localhost:4000
ARG NEXT_PUBLIC_API_ORIGIN=http://localhost:4000
ARG NEXT_PUBLIC_GATE_ORIGIN=http://localhost:4200
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID=""
ENV API_PROXY_TARGET=$API_PROXY_TARGET \
    NEXT_PUBLIC_API_ORIGIN=$NEXT_PUBLIC_API_ORIGIN \
    NEXT_PUBLIC_GATE_ORIGIN=$NEXT_PUBLIC_GATE_ORIGIN \
    NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID
RUN pnpm --filter @openseat/contracts build && pnpm --filter web build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
