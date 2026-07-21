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
RUN pnpm install --frozen-lockfile --filter api...
COPY apps/api apps/api
COPY packages packages
RUN pnpm --filter api db:generate && pnpm --filter api build
RUN pnpm --filter api deploy --prod --legacy /out

FROM build AS migrate
WORKDIR /repo/apps/api
ENTRYPOINT ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && node dist/seed.js"]

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out/dist ./dist
COPY --from=build --chown=node:node /out/node_modules ./node_modules
COPY --from=build --chown=node:node /out/package.json ./package.json
USER node
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main"]
