import { CalendarPlus, QrCode, Share2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DemoButtons } from "@/components/demo-buttons";
import { SeatMapTeaser } from "@/components/seat-map-teaser";

const proof = [
  {
    value: "40 / 40",
    label: "tickets issued when 100 buyers raced for 40 — never one more",
  },
  {
    value: "3 layers",
    label: "of double-sell protection, down to a database constraint",
  },
  {
    value: "$0 / mo",
    label: "of infrastructure — deployed, seeded, and always on",
  },
];

const steps = [
  {
    icon: CalendarPlus,
    title: "Create your event",
    description: "Name it, set the date, add ticket types. It starts as a draft you can shape.",
  },
  {
    icon: Share2,
    title: "Share one link",
    description: "Attendees claim tickets with just an email — no account, no app, no friction.",
  },
  {
    icon: QrCode,
    title: "Scan at the door",
    description: "Every ticket carries a QR code. Check-in tooling lands with milestone 4.",
  },
];

const highlights = [
  {
    title: "No double-selling, proven",
    description:
      "Inventory claims are atomic conditional updates backed by database constraints — and a test races 100 concurrent buyers to prove it on every pull request.",
  },
  {
    title: "Guest checkout in seconds",
    description:
      "Claim tickets with just an email. QR e-tickets arrive in your inbox, no account required.",
  },
  {
    title: "Built like production",
    description:
      "Rotating refresh tokens, idempotent orders, OpenAPI-generated clients, and architecture decisions written down in ADRs.",
  },
];

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center px-4 pb-24">
      <section className="grid w-full max-w-5xl items-center gap-10 pb-16 pt-16 sm:pt-24 lg:grid-cols-[1.1fr_1fr]">
        <div className="flex flex-col items-start gap-6">
          <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 font-mono text-xs text-primary">
            live · milestone 1 — events &amp; free tickets
          </span>
          <h1 className="text-balance text-5xl font-semibold leading-[1.05] sm:text-6xl">
            Every seat, <span className="text-primary">exactly once.</span>
          </h1>
          <p className="max-w-lg text-pretty text-lg leading-relaxed text-muted-foreground">
            OpenSeat is open ticketing built to survive on-sale rushes. Create an event, share the
            link, and issue QR tickets — without ever selling the same spot twice.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="lg" render={<Link href="/events/bangkok-indie-fest" />}>
              View the demo event
            </Button>
            <Button size="lg" variant="outline" render={<Link href="/register" />}>
              Create your own
            </Button>
          </div>
          <DemoButtons />
        </div>
        <SeatMapTeaser />
      </section>

      <section className="grid w-full max-w-5xl gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-3">
        {proof.map((item) => (
          <div key={item.value} className="flex flex-col gap-1.5 bg-card px-6 py-6">
            <p className="font-display text-3xl font-semibold tabular-nums text-primary">
              {item.value}
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">{item.label}</p>
          </div>
        ))}
      </section>

      <section className="mt-16 w-full max-w-5xl">
        <h2 className="text-2xl font-semibold">How it works</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {steps.map((step, index) => (
            <Card key={step.title} className="bg-card/60">
              <CardHeader>
                <div className="mb-1 flex items-center justify-between">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                    <step.icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">0{index + 1}</span>
                </div>
                <CardTitle className="text-base">{step.title}</CardTitle>
                <CardDescription className="leading-relaxed">{step.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <section className="mt-16 w-full max-w-5xl">
        <h2 className="text-2xl font-semibold">Under the hood</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {highlights.map((item) => (
            <Card key={item.title} className="bg-card/60">
              <CardHeader>
                <CardTitle className="text-base">{item.title}</CardTitle>
                <CardDescription className="leading-relaxed">{item.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <section className="mt-16 w-full max-w-5xl">
        <Card className="bg-card/60">
          <CardHeader>
            <CardTitle className="text-base">On the roadmap</CardTitle>
            <CardDescription className="leading-relaxed">
              Reserved seating with a live seat map (M2), simulated payments with webhooks (M3),
              organizer analytics and QR check-in (M4), a waiting room for ticket drops with a
              published load test (M5), and a drag-and-drop seat-map editor (M6).
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Follow the build at{" "}
            <a
              href="https://github.com/nkieu-config/openseat"
              className="underline underline-offset-4 hover:text-foreground"
            >
              github.com/nkieu-config/openseat
            </a>
            .
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
