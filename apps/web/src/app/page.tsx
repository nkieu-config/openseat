import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DemoButtons } from "@/components/demo-buttons";

const highlights = [
  {
    title: "No double-selling, proven",
    description:
      "Inventory claims are atomic conditional updates backed by database constraints — 100 concurrent buyers for 40 tickets issue exactly 40. There is a test for that.",
  },
  {
    title: "Guest checkout in seconds",
    description:
      "Claim tickets with just an email. QR e-tickets arrive in your inbox, no account required.",
  },
  {
    title: "Built like production",
    description:
      "Rotating refresh tokens, idempotent orders, OpenAPI-generated clients, and CI that races the database on every pull request.",
  },
];

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center px-4 pb-24">
      <section className="flex w-full max-w-3xl flex-col items-center gap-6 pb-16 pt-24 text-center">
        <span className="rounded-full border border-border px-3 py-1 font-mono text-xs text-muted-foreground">
          milestone 1 · events &amp; free tickets
        </span>
        <h1 className="text-5xl font-semibold tracking-tight sm:text-6xl">
          Open<span className="text-muted-foreground">Seat</span>
        </h1>
        <p className="max-w-xl text-balance text-lg text-muted-foreground">
          Open ticketing built to survive on-sale rushes. Create an event, share the link, and
          issue QR tickets — without ever selling the same spot twice.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" render={<Link href="/events/bangkok-indie-fest" />}>
            View the demo event
          </Button>
          <Button size="lg" variant="outline" render={<Link href="/register" />}>
            Create your own event
          </Button>
        </div>
        <DemoButtons />
      </section>
      <section className="grid w-full max-w-5xl gap-4 sm:grid-cols-3">
        {highlights.map((item) => (
          <Card key={item.title} className="bg-card/50">
            <CardHeader>
              <CardTitle className="text-base">{item.title}</CardTitle>
              <CardDescription className="leading-relaxed">{item.description}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </section>
      <section className="mt-16 w-full max-w-5xl">
        <Card className="bg-card/50">
          <CardHeader>
            <CardTitle className="text-base">On the roadmap</CardTitle>
            <CardDescription>
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
