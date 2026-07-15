"use client";

import type { OrderDetail } from "@openseat/contracts";
import { CircleCheck, SearchX } from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { EmptyState } from "@/components/empty-state";
import { TicketCard } from "@/components/ticket-card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { formatEventDate } from "@/lib/format";

function OrderSkeleton() {
  return (
    <div className="flex w-full max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-9 w-3/4" />
        <Skeleton className="h-5 w-1/2" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}

function OrderView() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const guestToken = searchParams.get("token");
  const { loading: authLoading } = useAuth();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");

  useEffect(() => {
    if (authLoading) {
      return;
    }
    let cancelled = false;
    void api
      .GET("/api/orders/{id}", {
        params: {
          path: { id: params.id },
          query: guestToken ? { token: guestToken } : {},
        },
      })
      .then(({ data, response }) => {
        if (cancelled) {
          return;
        }
        if (!response.ok || data === undefined) {
          setState("missing");
          return;
        }
        setOrder(data as unknown as OrderDetail);
        setState("ready");
      });
    return () => {
      cancelled = true;
    };
  }, [params.id, guestToken, authLoading]);

  if (state === "loading") {
    return <OrderSkeleton />;
  }
  if (state === "missing" || !order) {
    return (
      <EmptyState
        icon={SearchX}
        title="Order not found"
        description="This order does not exist, or you need the link from your confirmation email to view it."
        className="w-full max-w-md"
      />
    );
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-full bg-primary/15 text-primary">
            <CircleCheck className="size-4" aria-hidden="true" />
          </span>
          <Badge variant={order.status === "paid" ? "default" : "secondary"}>{order.status}</Badge>
          <span className="font-mono text-xs text-muted-foreground">{order.id.slice(0, 8)}</span>
        </div>
        <h1 className="text-3xl font-semibold sm:text-4xl">
          You&apos;re going to {order.event.title}
        </h1>
        <p className="text-muted-foreground">
          {formatEventDate(order.event.startsAt)} · {order.event.venueName}
        </p>
        <p className="text-sm text-muted-foreground">
          A copy of these tickets was emailed to {order.buyerEmail}. Show a QR code at the door.
        </p>
      </div>
      <Separator />
      <div className="grid gap-4 sm:grid-cols-2">
        {order.tickets.map((ticket, index) => (
          <TicketCard
            key={ticket.id}
            title={
              ticket.seat
                ? `${ticket.seat.section} ${ticket.seat.rowLabel}${ticket.seat.number}`
                : `${ticket.ticketType.name} · #${index + 1}`
            }
            subtitle={
              ticket.seat
                ? `${ticket.ticketType.name} · ${ticket.attendeeName}`
                : ticket.attendeeName
            }
            qrToken={ticket.qrToken}
          />
        ))}
      </div>
      <p className="text-center text-sm text-muted-foreground">
        <Link
          href={`/events/${order.event.slug}`}
          className="underline underline-offset-4 hover:text-foreground"
        >
          Back to the event page
        </Link>
      </p>
    </div>
  );
}

export default function OrderPage() {
  return (
    <main className="flex flex-1 flex-col items-center px-4 py-12">
      <Suspense>
        <OrderView />
      </Suspense>
    </main>
  );
}
