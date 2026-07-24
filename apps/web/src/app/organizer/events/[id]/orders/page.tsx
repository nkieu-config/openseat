"use client";

import { ArrowLeft, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import {
  ConsoleEventMissing,
  ConsoleLoadFailed,
} from "@/components/console/gate-notice";
import { ConsolePanel, SignalLamp } from "@/components/console/panel";
import { Button } from "@/components/ui/button";
import { api, apiErrorMessage } from "@/lib/api";
import { fetchEventOrders, type OrderRow } from "@/lib/dashboard";
import { formatBaht } from "@/lib/format";
import { useConsoleGate } from "@/lib/use-console-gate";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = {
  paid: "paid",
  partially_refunded: "partially refunded",
  refunded: "refunded",
};

function shortId(id: string): string {
  return id.slice(0, 8);
}

export default function OrdersConsolePage() {
  const params = useParams<{ id: string }>();
  const eventId = params.id;
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [armedOrderId, setArmedOrderId] = useState<string | null>(null);
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);

  const load = useCallback(() => fetchEventOrders(eventId), [eventId]);
  const gate = useConsoleGate<OrderRow[]>(
    `/organizer/events/${eventId}/orders`,
    load,
  );
  const state = gate.state;
  const orders = gate.data ?? [];

  function toggleTicket(ticketId: string) {
    setArmedOrderId(null);
    setSelected((current) => ({ ...current, [ticketId]: !current[ticketId] }));
  }

  function selectedTicketIds(order: OrderRow): string[] {
    return order.tickets
      .filter((ticket) => ticket.status === "issued" && selected[ticket.id])
      .map((ticket) => ticket.id);
  }

  function selectedAmount(order: OrderRow): number {
    return order.tickets
      .filter((ticket) => ticket.status === "issued" && selected[ticket.id])
      .reduce((total, ticket) => total + ticket.priceSatang, 0);
  }

  async function refund(order: OrderRow) {
    const ticketIds = selectedTicketIds(order);
    if (ticketIds.length === 0) {
      return;
    }
    if (armedOrderId !== order.id) {
      setArmedOrderId(order.id);
      return;
    }
    setBusyOrderId(order.id);
    setArmedOrderId(null);
    try {
      const { data, error, response } = await api.POST(
        "/api/events/{eventId}/orders/{orderId}/refunds",
        {
          params: { path: { eventId, orderId: order.id } },
          headers: { "Idempotency-Key": crypto.randomUUID() },
          body: { ticketIds },
        },
      );
      if (!response.ok || data === undefined) {
        toast.error(apiErrorMessage(error, "Could not refund those tickets"));
        return;
      }
      toast.success("Refund started — the money is on its way back");
      setSelected({});
      gate.reload();
    } catch (failure) {
      toast.error(
        failure instanceof Error
          ? failure.message
          : "Could not refund those tickets",
      );
    } finally {
      setBusyOrderId(null);
    }
  }

  async function retry(order: OrderRow, refundId: string) {
    setBusyOrderId(order.id);
    try {
      const { data, error, response } = await api.POST(
        "/api/refunds/{refundId}/retry",
        { params: { path: { refundId } } },
      );
      if (!response.ok || data === undefined) {
        toast.error(apiErrorMessage(error, "Could not retry the refund"));
        return;
      }
      toast.success("Retrying the refund");
      gate.reload();
    } catch (failure) {
      toast.error(
        failure instanceof Error ? failure.message : "Could not retry the refund",
      );
    } finally {
      setBusyOrderId(null);
    }
  }

  if (state === "loading") {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="font-mono text-sm text-muted-foreground">
          Loading orders…
        </p>
      </main>
    );
  }
  if (state === "forbidden") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
        <p className="text-lg font-medium">Your role does not allow this view</p>
        <p className="text-sm text-muted-foreground">
          Refunds and the order ledger are open to managers and the event owner.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-2"
          render={<Link href={`/organizer/events/${eventId}/checkin`} />}
        >
          Go to check-in
        </Button>
      </main>
    );
  }
  if (state === "error") {
    return <ConsoleLoadFailed onRetry={gate.reload} />;
  }
  if (state !== "ready") {
    return <ConsoleEventMissing />;
  }

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 md:py-10">
      <div className="flex flex-col gap-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <Link
              href={`/organizer/events/${eventId}`}
              className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" />
              Console
            </Link>
            <h1 className="text-3xl font-semibold tracking-tight">Orders</h1>
            <p className="text-sm text-muted-foreground">
              Refund any ticket that has not been used.
            </p>
          </div>
          <SignalLamp tone="idle" label={`${orders.length} orders`} />
        </header>

        {orders.length === 0 ? (
          <ConsolePanel label="Ledger">
            <p className="py-8 text-center text-sm text-muted-foreground">
              No paid orders yet.
            </p>
          </ConsolePanel>
        ) : (
          <div className="flex flex-col gap-4">
            {orders.map((order) => {
              const ids = selectedTicketIds(order);
              const armed = armedOrderId === order.id;
              const busy = busyOrderId === order.id;
              const amount = selectedAmount(order);
              return (
                <ConsolePanel
                  key={order.id}
                  label={`#${shortId(order.id)}`}
                  right={
                    <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                      {STATUS_LABEL[order.status] ?? order.status}
                    </span>
                  }
                >
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">
                          {order.buyerName}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {order.buyerEmail}
                        </span>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-sm tabular-nums">
                          {formatBaht(order.totalSatang)}
                        </div>
                        {order.refundedSatang > 0 ? (
                          <div className="font-mono text-xs tabular-nums text-signal-warn">
                            −{formatBaht(order.refundedSatang)} refunded
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <ul className="flex flex-col gap-1.5">
                      {order.tickets.map((ticket) => {
                        const refundable = ticket.status === "issued";
                        const checked = Boolean(selected[ticket.id]);
                        return (
                          <li key={ticket.id}>
                            <label
                              className={cn(
                                "flex min-h-11 items-center gap-3 rounded-md border border-console-line px-3 py-2 text-sm",
                                refundable
                                  ? "cursor-pointer hover:border-primary/60"
                                  : "opacity-60",
                              )}
                            >
                              <input
                                type="checkbox"
                                className="size-4 accent-primary"
                                disabled={!refundable || busy}
                                checked={checked}
                                onChange={() => toggleTicket(ticket.id)}
                              />
                              <span className="flex-1">
                                {ticket.ticketType}
                                {ticket.seat ? ` · ${ticket.seat}` : ""}
                              </span>
                              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                                {formatBaht(ticket.priceSatang)}
                              </span>
                              <span
                                className={cn(
                                  "font-mono text-[10px] uppercase tracking-[0.16em]",
                                  ticket.status === "void"
                                    ? "text-signal-warn"
                                    : ticket.status === "checked_in"
                                      ? "text-muted-foreground"
                                      : "text-signal-live",
                                )}
                              >
                                {ticket.status}
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>

                    {order.refunds.length > 0 ? (
                      <ul className="flex flex-col gap-1 border-t border-console-line pt-3">
                        {order.refunds.map((refundRow) => (
                          <li
                            key={refundRow.id}
                            className="flex items-center justify-between gap-3 text-xs"
                          >
                            <span className="font-mono uppercase tracking-[0.14em] text-muted-foreground">
                              refund {formatBaht(refundRow.amountSatang)} ·{" "}
                              {refundRow.status}
                            </span>
                            {refundRow.status === "failed" ? (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={busy}
                                onClick={() => void retry(order, refundRow.id)}
                              >
                                <RotateCcw className="size-3.5" />
                                Retry
                              </Button>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    <div className="flex justify-end">
                      <Button
                        variant={armed ? "destructive" : "outline"}
                        size="sm"
                        disabled={ids.length === 0 || busy}
                        onClick={() => void refund(order)}
                      >
                        {busy
                          ? "Refunding…"
                          : ids.length === 0
                            ? "Select tickets to refund"
                            : armed
                              ? `Refund ${formatBaht(amount)} — click to confirm`
                              : `Refund ${ids.length} ticket${ids.length > 1 ? "s" : ""}`}
                      </Button>
                    </div>
                  </div>
                </ConsolePanel>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
