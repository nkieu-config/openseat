# Running OpenSeat on AWS

OpenSeat ships on a deliberately free stack (Vercel + Render + Neon + Render Key Value). This document maps that stack to a production AWS architecture — what each piece becomes, why, and roughly what it costs. It is a design target, not a deployed system: the point is that nothing in the codebase blocks the move, because the hard decisions (DB-authoritative inventory, an outbox instead of Kafka, stateless admission) were made with this in mind.

## Component mapping

| Today (free) | AWS | Why |
|---|---|---|
| `apps/web` on Vercel | **CloudFront + S3** for static assets; **SSR on Lambda** via OpenNext (or Amplify Hosting) | Keeps SSR/ISR for SEO without running a Next server 24/7; CloudFront is the edge. |
| `apps/api` (NestJS) on Render | **ECS Fargate** service behind an **ALB**, 2+ tasks across AZs | Stateless HTTP + WebSocket; autoscale on CPU/RPS. App Runner is the simpler alternative if scale is modest. |
| `services/gate` (Go) on Render | **ECS Fargate** service behind the ALB | The waiting-room front door; scales horizontally because admission is a stateless signed token (ADR 0007). |
| `services/paymock` (Go) on Render | **ECS Fargate** (or drop it) | In production this is replaced by a real PSP (Stripe/Omise); the integration is already vendor-shaped (ADR 0005). |
| Neon Postgres | **RDS for PostgreSQL** (Multi-AZ) or **Aurora Serverless v2** | The single source of truth. Multi-AZ for failover; a read replica for the GraphQL dashboard (ADR 0006) if reads grow. |
| Render Key Value (Redis) | **ElastiCache for Redis** | Holds sweeper/queues (BullMQ), the Socket.IO fan-out adapter, rate limits, and the waiting-room ZSET. Cluster mode when the queue gets hot. |
| Resend (email) | **SES** | Ticket QR emails; the notifications module already goes through SMTP-shaped transport. |
| Render env groups | **Secrets Manager** / SSM Parameter Store | `JWT_SECRET`, `GATE_ADMISSION_SECRET`, DB URL, PSP keys. |
| — | **Route 53 + ACM + WAF** | DNS, TLS, and a basic WAF in front of CloudFront/ALB. |
| — | **CloudWatch + X-Ray** | Logs, metrics, alarms, request tracing. |

## Things that need attention

- **Realtime** — Socket.IO fan-out already uses a Redis adapter, so multiple API tasks stay in sync through ElastiCache. The ALB must allow WebSocket upgrades; sticky sessions are optional because state lives in Redis, not the task.
- **Background work** — BullMQ on ElastiCache is fine to keep. If job volume outgrows a single Redis, the transactional **outbox** (ADR 0003) is the seam: the dispatcher can relay outbox rows to **SQS** (or EventBridge) instead of BullMQ without touching the code that *writes* the outbox. That swap is the documented trigger, not a rewrite.
- **Inventory correctness is unaffected** — no-double-sell rests on Postgres constraints and conditional updates (ADR 0002), so it behaves identically on RDS/Aurora. Redis losing the queue mid-drop just resets the line; it never risks a seat.
- **The Gate scales first, cheapest** — the k6 report (`docs/load-tests/gate-report.md`) shows one instance absorbing ~13k joins/s. Under a real on-sale you add Gate tasks; the API and DB stay shielded behind the waiting room.

## Rough monthly cost (small production)

A modest always-on footprint (2× small Fargate tasks for the API, 1× for the Gate, `db.t4g.small` Multi-AZ RDS, `cache.t4g.micro` ElastiCache, CloudFront + S3 + Lambda for the web, SES, Secrets Manager):

| Item | Est. / mo (USD) |
|---|---|
| ECS Fargate (API 2× + Gate 1×, small) | ~$70 |
| RDS PostgreSQL `t4g.small` Multi-AZ | ~$60 |
| ElastiCache `t4g.micro` | ~$15 |
| ALB | ~$20 |
| CloudFront + S3 + Lambda (web) | ~$10–25 |
| SES + Secrets Manager + CloudWatch | ~$10 |
| **Total** | **~$185–205 / mo** |

Scale-to-zero variants (App Runner min-1, Aurora Serverless v2 min-capacity, Lambda-only web) trade cold-start latency for a materially lower idle bill — the same free-tier trade the demo already makes with Render sleeping the Gate and PayMock.

## Not included on purpose

Blue/green deploys, per-tenant sharding, a data warehouse for analytics, and cross-region DR are all natural next steps but out of scope for a portfolio target. The architecture above is the honest "make it production" version of what runs today, with the ADRs as the map of which decisions were load-bearing.
