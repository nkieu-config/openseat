"use client";

import type { MyTicket } from "@openseat/contracts";
import { Ticket } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { EmptyState } from "@/components/empty-state";
import { TicketCard } from "@/components/ticket-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { formatEventDate } from "@/lib/format";

export default function MyTicketsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [tickets, setTickets] = useState<MyTicket[] | null>(null);

  useEffect(() => {
    if (loading) {
      return;
    }
    if (!user) {
      router.replace("/login?next=/me/tickets");
      return;
    }
    let cancelled = false;
    void api.GET("/api/me/tickets").then(({ data, response }) => {
      if (!cancelled && response.ok && data !== undefined) {
        setTickets(data);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [user, loading, router]);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-12">
      <h1 className="text-3xl font-semibold">My tickets</h1>
      {loading || (user && tickets === null) ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      ) : tickets && tickets.length > 0 ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {tickets.map((ticket) => (
            <TicketCard
              key={ticket.id}
              title={ticket.event.title}
              subtitle={`${
                ticket.seat
                  ? `${ticket.seat.section} ${ticket.seat.rowLabel}${ticket.seat.number} · `
                  : ""
              }${ticket.ticketType.name} · ${formatEventDate(ticket.event.startsAt)} · ${ticket.event.venueName}`}
              qrToken={ticket.qrToken}
              status={ticket.status}
              qrSize={120}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Ticket}
          title="No tickets yet"
          description="Claim a free ticket at the demo event to see the full flow — QR code, email, and all."
          className="mt-8"
          action={
            <Button variant="outline" size="sm" render={<Link href="/events/bangkok-indie-fest" />}>
              Browse the demo event
            </Button>
          }
        />
      )}
    </main>
  );
}
