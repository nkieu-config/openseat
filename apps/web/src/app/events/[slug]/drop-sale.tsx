"use client";

import type { EventDetail } from "@openseat/contracts";
import { Ticket } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getAdmissionToken,
  isAdmissionValid,
  subscribeAdmission,
} from "@/lib/admission";
import { RsvpCard } from "./rsvp-card";

function useAdmitted(eventId: string): boolean {
  return useSyncExternalStore(
    subscribeAdmission,
    () => isAdmissionValid(getAdmissionToken(eventId)),
    () => false,
  );
}

export function DropSale({ event }: { event: EventDetail }) {
  const admitted = useAdmitted(event.id);
  const gaTypes = event.ticketTypes.filter((type) => type.kind === "ga");
  const capacity = event.ticketTypes.reduce(
    (sum, type) => sum + type.quantity,
    0,
  );

  if (!admitted) {
    return (
      <Card className="sticky top-20">
        <CardHeader>
          <div className="flex items-center gap-2">
            <span className="size-2 animate-pulse rounded-full bg-primary" />
            <span className="font-mono text-xs uppercase tracking-widest text-primary">
              Timed on-sale
            </span>
          </div>
          <CardTitle className="text-lg">Enter through the waiting room</CardTitle>
          <CardDescription>
            A hard-capped drop of {capacity.toLocaleString()} passes. Everyone
            joins a live queue and is admitted in turn — no refreshing, no
            stampede.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            className="w-full"
            render={<Link href={`/events/${event.slug}/queue`} />}
          >
            <Ticket className="size-4" />
            Enter the on-sale
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-primary">
        You&rsquo;re in — grab your pass before they&rsquo;re gone.
      </div>
      {gaTypes.length > 0 ? (
        <RsvpCard event={{ ...event, ticketTypes: gaTypes }} />
      ) : null}
    </div>
  );
}
