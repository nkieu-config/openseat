import type { EventDetail } from "@openseat/contracts";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { apiBaseUrl } from "@/lib/api";
import { formatEventDate } from "@/lib/format";
import { RsvpCard } from "./rsvp-card";

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

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-12">
      <div className="grid gap-10 lg:grid-cols-[1fr_360px]">
        <article className="flex flex-col gap-6">
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
          <RsvpCard event={event} />
        </aside>
      </div>
    </main>
  );
}
