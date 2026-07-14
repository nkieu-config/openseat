"use client";

import type { OrderDetail } from "@openseat/contracts";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import QRCode from "react-qr-code";
import { useAuth } from "@/components/auth-provider";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { api } from "@/lib/api";
import { formatEventDate } from "@/lib/format";

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
    return <p className="text-muted-foreground">Loading your order…</p>;
  }
  if (state === "missing" || !order) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Order not found</CardTitle>
          <CardDescription>
            This order does not exist, or you need the link from your confirmation email to view
            it.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Badge variant={order.status === "paid" ? "default" : "secondary"}>{order.status}</Badge>
          <span className="font-mono text-xs text-muted-foreground">{order.id}</span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">
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
          <Card key={ticket.id}>
            <CardHeader>
              <CardTitle className="text-base">
                {ticket.ticketType.name} · #{index + 1}
              </CardTitle>
              <CardDescription>{ticket.attendeeName}</CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center">
              <div className="rounded-lg bg-white p-3">
                <QRCode value={ticket.qrToken} size={140} />
              </div>
            </CardContent>
          </Card>
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
