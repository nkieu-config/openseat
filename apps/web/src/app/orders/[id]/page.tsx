"use client";

import type { OrderDetail } from "@openseat/contracts";
import { CircleCheck, CircleX, Clock, SearchX } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { EmptyState } from "@/components/empty-state";
import { TicketCard } from "@/components/ticket-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { formatEventDate, formatPrice } from "@/lib/format";

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

function PaymentCountdown({ expiresAt }: { expiresAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  const msLeft = Math.max(0, new Date(expiresAt).getTime() - now);
  const minutes = Math.floor(msLeft / 60_000);
  const seconds = Math.floor((msLeft % 60_000) / 1000);
  return (
    <span className="font-mono tabular-nums text-primary">
      {minutes}:{seconds.toString().padStart(2, "0")}
    </span>
  );
}

function OrderView() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const tokenParam = searchParams.get("token");
  const [guestToken] = useState<string | null>(tokenParam);
  const paymentResult = searchParams.get("payment");
  const { loading: authLoading } = useAuth();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (paymentResult === "failed") {
      toast.error("The payment was declined — your order was canceled");
    }
  }, [paymentResult]);

  useEffect(() => {
    if (!tokenParam) {
      return;
    }
    const remaining = new URLSearchParams(searchParams.toString());
    remaining.delete("token");
    const query = remaining.toString();
    router.replace(
      query ? `/orders/${params.id}?${query}` : `/orders/${params.id}`,
      { scroll: false },
    );
  }, [tokenParam, searchParams, params.id, router]);

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
        setOrder(data);
        setState("ready");
      });
    return () => {
      cancelled = true;
    };
  }, [params.id, guestToken, authLoading, reloadKey]);

  const isLive =
    order !== null &&
    ["awaiting_payment", "paid", "partially_refunded"].includes(order.status);
  const orderId = order?.id;
  const orderEventId = order?.event.id;
  const orderGuestToken = order?.guestToken;

  useEffect(() => {
    if (!isLive || !orderId || !orderEventId) {
      return;
    }
    let cancelled = false;
    let disconnect: (() => void) | null = null;
    void import("@/lib/realtime").then(({ createEventSocket }) => {
      if (cancelled) {
        return;
      }
      const socket = createEventSocket(orderEventId);
      socket.emit("join-order", {
        orderId,
        guestToken: orderGuestToken,
      });
      socket.on("order", () => setReloadKey((key) => key + 1));
      disconnect = () => socket.disconnect();
    });
    const poll = setInterval(() => setReloadKey((key) => key + 1), 10_000);
    return () => {
      cancelled = true;
      clearInterval(poll);
      disconnect?.();
    };
  }, [isLive, orderId, orderEventId, orderGuestToken]);

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

  if (order.status === "awaiting_payment") {
    return (
      <div className="flex w-full max-w-xl flex-col gap-6">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-full bg-primary/15 text-primary">
              <Clock className="size-4" aria-hidden="true" />
            </span>
            <Badge variant="secondary">awaiting payment</Badge>
          </div>
          <h1 className="text-3xl font-semibold sm:text-4xl">Complete your payment</h1>
          <p className="text-muted-foreground">
            {order.event.title} · {formatPrice(order.totalSatang)}
          </p>
          {order.expiresAt ? (
            <p className="text-sm text-muted-foreground">
              Your seats and tickets are reserved for{" "}
              <PaymentCountdown expiresAt={order.expiresAt} /> — after that the order expires and
              they go back on sale.
            </p>
          ) : null}
        </div>
        {order.payment?.checkoutUrl ? (
          <Button
            size="lg"
            onClick={() => window.location.assign(order.payment!.checkoutUrl)}
          >
            Pay {formatPrice(order.totalSatang)} with PayMock
          </Button>
        ) : null}
        <p className="text-xs text-muted-foreground">
          PayMock is a simulated payment provider — no real money moves. This page updates itself
          the moment the payment lands.
        </p>
      </div>
    );
  }

  if (order.status === "expired" || order.status === "canceled") {
    return (
      <EmptyState
        icon={CircleX}
        title={order.status === "expired" ? "This order expired" : "This order was canceled"}
        description="The seats and tickets in it went back on sale. You can pick them again from the event page."
        className="w-full max-w-md"
        action={
          <Button variant="outline" size="sm" render={<Link href={`/events/${order.event.slug}`} />}>
            Back to the event
          </Button>
        }
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
          <Badge variant={order.status === "paid" ? "default" : "secondary"}>
            {order.status.replace(/_/g, " ")}
          </Badge>
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
        {order.refundedSatang > 0 ? (
          <p className="text-sm text-signal-warn">
            {formatPrice(order.refundedSatang)} refunded — refunded tickets are no
            longer valid for entry.
          </p>
        ) : null}
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
            status={ticket.status}
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
