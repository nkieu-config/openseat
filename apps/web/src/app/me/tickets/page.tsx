"use client";

import type { MyTicket } from "@openseat/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import QRCode from "react-qr-code";
import { useAuth } from "@/components/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
        setTickets(data as unknown as MyTicket[]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [user, loading, router]);

  if (loading || (user && tickets === null)) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground">Loading your tickets…</p>
      </main>
    );
  }
  if (!user) {
    return null;
  }

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">My tickets</h1>
      {tickets && tickets.length > 0 ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {tickets.map((ticket) => (
            <Card key={ticket.id}>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">{ticket.event.title}</CardTitle>
                  <Badge variant={ticket.status === "issued" ? "default" : "secondary"}>
                    {ticket.status.replace("_", " ")}
                  </Badge>
                </div>
                <CardDescription>
                  {ticket.ticketType.name} · {formatEventDate(ticket.event.startsAt)} ·{" "}
                  {ticket.event.venueName}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex justify-center">
                <div className="rounded-lg bg-white p-3">
                  <QRCode value={ticket.qrToken} size={120} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <p className="mt-8 text-muted-foreground">
          No tickets yet —{" "}
          <Link
            href="/events/bangkok-indie-fest"
            className="underline underline-offset-4 hover:text-foreground"
          >
            grab one at the demo event
          </Link>
          .
        </p>
      )}
    </main>
  );
}
