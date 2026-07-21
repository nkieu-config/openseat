import type { EventDetail } from "@openseat/contracts";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ServiceWarmer } from "@/components/service-warmer";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { apiBaseUrl } from "@/lib/api";
import { formatEventDate } from "@/lib/format";
import { gateOrigin } from "@/lib/gate";
import { paymockOrigin } from "@/lib/paymock";
import { DropSale } from "./drop-sale";
import { RsvpCard } from "./rsvp-card";
import { SeatPicker } from "./seat-picker";

type PageProps = { params: Promise<{ slug: string }> };

async function fetchEvent(slug: string): Promise<EventDetail | null> {
  const res = await fetch(`${apiBaseUrl}/api/events/${encodeURIComponent(slug)}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    return null;
  }
  return (await res.json()) as EventDetail;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const event = await fetchEvent(slug);
  if (!event) {
    return { title: "Event not found" };
  }
  return {
    title: event.title,
    description: `${event.venueName} · ${formatEventDate(event.startsAt)} — get tickets on OpenSeat.`,
    openGraph: {
      title: event.title,
      description: event.description.slice(0, 160),
    },
  };
}

export default async function EventPage({ params }: PageProps) {
  const { slug } = await params;
  const event = await fetchEvent(slug);
  if (!event) {
    notFound();
  }

  const soldOut = event.ticketTypes.every((type) => type.remaining === 0);
  const gaTypes = event.ticketTypes.filter((type) => type.kind === "ga");
  const buyable = !soldOut && event.ticketTypes.some((type) => type.priceSatang > 0);
  const warmOrigins = [
    buyable ? paymockOrigin : null,
    event.dropMode ? gateOrigin : null,
  ].filter((origin): origin is string => origin !== null);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-12">
      <ServiceWarmer origins={warmOrigins} />
      <div className="grid gap-10 lg:grid-cols-[1fr_360px]">
        <article className="flex flex-col gap-6">
          <div className="relative h-40 overflow-hidden rounded-2xl border border-border sm:h-52">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/25 via-secondary/40 to-background" />
            <div className="absolute -top-20 left-1/2 h-56 w-[28rem] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />
            <span
              aria-hidden="true"
              className="absolute -bottom-6 right-4 select-none font-display text-9xl font-bold text-foreground/10"
            >
              {event.title.charAt(0)}
            </span>
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              {event.isDemo ? <Badge variant="secondary">Demo event</Badge> : null}
              {soldOut ? <Badge variant="destructive">Sold out</Badge> : null}
            </div>
            <h1 className="text-4xl font-semibold tracking-tight">{event.title}</h1>
            <p className="text-muted-foreground">
              {formatEventDate(event.startsAt)}
              {event.endsAt ? ` – ${formatEventDate(event.endsAt)}` : ""} · {event.venueName}
            </p>
            <p className="text-sm text-muted-foreground">
              Hosted by {event.organizer.displayName}
            </p>
          </div>
          <Separator />
          <div className="whitespace-pre-line leading-relaxed text-foreground/90">
            {event.description || "No description yet."}
          </div>
        </article>
        <aside>
          {event.dropMode ? (
            <DropSale event={event} />
          ) : gaTypes.length > 0 ? (
            <RsvpCard event={{ ...event, ticketTypes: gaTypes }} />
          ) : (
            <Card className="sticky top-20">
              <CardHeader>
                <CardTitle className="text-lg">Reserved seating</CardTitle>
                <CardDescription>
                  This event uses a live seat map — pick your exact seat below.
                </CardDescription>
              </CardHeader>
            </Card>
          )}
        </aside>
      </div>
      {!event.dropMode && event.seatMap ? (
        <section className="mt-10">
          <SeatPicker eventId={event.id} />
        </section>
      ) : null}
    </main>
  );
}
