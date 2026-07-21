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
RUN cd /out/node_modules/.pnpm && rm -rf \
      prisma@* \
      @prisma+studio-core@* \
      @prisma+dev@* \
      @prisma+config@* \
      @electric-sql+* \
      effect@* \
      typescript@* \
      react@* \
      react-dom@* \
      @radix-ui+*

FROM build AS migrate
WORKDIR /repo/apps/api
ENTRYPOINT ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && node dist/seed.js"]

FROM gcr.io/distroless/nodejs22-debian12:nonroot AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=nonroot:nonroot /out/dist ./dist
COPY --from=build --chown=nonroot:nonroot /out/node_modules ./node_modules
COPY --from=build --chown=nonroot:nonroot /out/package.json ./package.json
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD ["/nodejs/bin/node", "-e", "fetch('http://127.0.0.1:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["dist/main"]
