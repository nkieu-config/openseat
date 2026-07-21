# GitHub repo presentation

What is actually set on the repository, so this file and the settings page can be diffed. Description and topics are set through the `gh` CLI; the social preview is not exposed by either the REST or the GraphQL API — `openGraphImageUrl` is read-only — so it is the one item that has to be uploaded by hand.

## About — set

Description:

> Open ticketing with real-time reserved seating — Next.js, NestJS, Go, and Postgres, built to survive on-sale rushes without ever double-selling a seat.

Website: <https://openseat-ticket.vercel.app>

The earlier draft of this line listed the whole stack and all eleven milestones. It was cut down because this is the one line that shows under the repo name in search results, where GitHub truncates around 150 characters — everything after that only ever appeared on the repo page itself, which the README already covers.

```bash
gh repo edit --description "…"
```

## Topics — set (16)

`golang` `monorepo` `nestjs` `nextjs` `opentelemetry` `playwright` `postgresql` `prisma` `real-time` `redis` `reserved-seating` `socket-io` `ticketing` `turborepo` `typescript` `websockets`

Both `socket-io` and `websockets` are kept: they are different searches, and the realtime layer is genuinely both.

```bash
gh repo edit --add-topic <topic>
```

## Social preview — needs a manual upload

Settings → General → Social preview → **Upload an image**, then pick `docs/media/social-preview.png`.

The file is already captured and meets GitHub's requirements: 1280×640 (the recommended 2:1), PNG, 80 KB against a 1 MB ceiling. Without it, links pasted into Slack, LinkedIn, or a message render GitHub's generated grey card instead of the product.

Verify afterwards — this flips to `true` once the upload lands:

```bash
gh api graphql -f query='{repository(owner:"nkieu-config",name:"openseat"){usesCustomOpenGraphImage}}'
```

## License

MIT, `LICENSE` at the repo root. GitHub detects it and shows the badge automatically.
