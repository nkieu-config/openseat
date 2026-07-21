'use client';

import type { SeatInfo, SeatMapData, SeatsChangedMessage } from '@openseat/contracts';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { api, apiErrorMessage } from '@/lib/api';
import { getHoldKey } from '@/lib/hold-key';
import { createEventSocket } from '@/lib/realtime';
import {
  PAD,
  mapHeight,
  mapWidth,
  seatX,
  seatY,
  useSeatMapViewport,
} from '@/lib/seat-map-viewport';
import { Seat, seatFill, seatLabel } from './seat';

function HoldCountdown({ expiresAt }: { expiresAt: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (expiresAt === null) {
      return;
    }
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);
  if (expiresAt === null) {
    return null;
  }
  return (
    <p className="font-mono text-sm tabular-nums text-muted-foreground">
      Held for <span className="text-primary">{formatCountdown(expiresAt - now)}</span>
    </p>
  );
}

function formatCountdown(msLeft: number): string {
  const totalSeconds = Math.max(0, Math.floor(msLeft / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function SeatPicker({ eventId }: { eventId: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const [map, setMap] = useState<SeatMapData | null>(null);
  const [failed, setFailed] = useState(false);
  const viewport = useSeatMapViewport();
  const [buyerName, setBuyerName] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const holdKey = useMemo(() => getHoldKey(), []);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const idempotencyKey = useRef<string>(crypto.randomUUID());
  const earliestExpiryRef = useRef<number | null>(null);

  const refresh = useCallback(() => setReloadKey((key) => key + 1), []);

  useEffect(() => {
    let cancelled = false;
    void api
      .GET('/api/events/{eventId}/seat-map', {
        params: { path: { eventId }, header: { 'x-hold-key': holdKey } },
      })
      .then(({ data, response }) => {
        if (cancelled) {
          return;
        }
        if (!response.ok || data === undefined) {
          setFailed(true);
          return;
        }
        setMap(data);
      });
    return () => {
      cancelled = true;
    };
  }, [eventId, holdKey, reloadKey]);

  useEffect(() => {
    const socket = createEventSocket(eventId);
    socket.on('seats', (message: SeatsChangedMessage) => {
      setMap((current) => {
        if (!current) {
          return current;
        }
        const held = new Set(message.held);
        const released = new Set(message.released);
        const sold = new Set(message.sold);
        return {
          ...current,
          seats: current.seats.map((seat) => {
            if (sold.has(seat.id)) {
              return { ...seat, status: 'sold', mine: false };
            }
            if (released.has(seat.id)) {
              return { ...seat, status: 'available', mine: false, expiresAt: undefined };
            }
            if (held.has(seat.id) && !seat.mine) {
              return { ...seat, status: 'held' };
            }
            return seat;
          }),
        };
      });
    });
    return () => {
      socket.emit('leave', { eventId });
      socket.disconnect();
    };
  }, [eventId]);


  const mySeats = useMemo(() => (map?.seats ?? []).filter((seat) => seat.mine), [map]);
  const earliestExpiry = useMemo(
    () =>
      mySeats.reduce<number | null>((earliest, seat) => {
        if (!seat.expiresAt) {
          return earliest;
        }
        const expiry = new Date(seat.expiresAt).getTime();
        return earliest === null ? expiry : Math.min(earliest, expiry);
      }, null),
    [mySeats],
  );

  useEffect(() => {
    earliestExpiryRef.current = earliestExpiry;
  }, [earliestExpiry]);

  useEffect(() => {
    if (!map) {
      return;
    }
    const element = containerRef.current;
    if (!element) {
      return;
    }
    viewport.fitToWidth(element.clientWidth, map.meta.maxCols);
  }, [map, viewport]);

  useEffect(() => {
    if (mySeats.length === 0) {
      return;
    }
    const interval = setInterval(() => {
      const currentNow = Date.now();
      if (earliestExpiryRef.current !== null && earliestExpiryRef.current <= currentNow) {
        earliestExpiryRef.current = null;
        toast.error('Your seat holds expired — pick them again');
        refresh();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [mySeats.length, refresh]);

  const applySeat = useCallback((seatId: string, patch: Partial<SeatInfo>) => {
    setMap((current) =>
      current
        ? {
            ...current,
            seats: current.seats.map((seat) => (seat.id === seatId ? { ...seat, ...patch } : seat)),
          }
        : current,
    );
  }, []);

  const toggleSeat = useCallback(
    async (seat: SeatInfo) => {
      if (viewport.suppressClick.current || seat.status === 'sold' || claiming) {
        return;
      }
      if (seat.mine) {
        applySeat(seat.id, { status: 'available', mine: false, expiresAt: undefined });
        const { response } = await api.DELETE('/api/events/{eventId}/holds/{seatId}', {
          params: { path: { eventId, seatId: seat.id }, header: { 'x-hold-key': holdKey } },
        });
        if (!response.ok) {
          refresh();
        }
        return;
      }
      if (seat.status === 'held') {
        toast.error(`${seatLabel(seat)} is held by someone else`);
        return;
      }
      applySeat(seat.id, { status: 'held', mine: true });
      const { data, error, response } = await api.POST('/api/events/{eventId}/holds', {
        params: { path: { eventId }, header: { 'x-hold-key': holdKey } },
        body: { seatId: seat.id },
      });
      if (!response.ok || data === undefined) {
        applySeat(seat.id, {
          status: response.status === 409 ? 'held' : 'available',
          mine: false,
        });
        toast.error(apiErrorMessage(error, `Could not hold ${seatLabel(seat)}`));
        return;
      }
      const hold = data;
      applySeat(seat.id, { status: 'held', mine: true, expiresAt: hold.expiresAt });
    },
    [applySeat, claiming, eventId, holdKey, refresh],
  );

  const seatNodes = useMemo(
    () =>
      (map?.seats ?? []).map((seat) => (
        <Seat
          key={seat.id}
          seat={seat}
          x={seatX(seat.x)}
          y={seatY(seat.y)}
          onToggle={(target) => void toggleSeat(target)}
        />
      )),
    [map, toggleSeat],
  );

  async function claim(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    if (mySeats.length === 0) {
      return;
    }
    setClaiming(true);
    try {
      const { data, error, response } = await api.POST('/api/events/{eventId}/orders', {
        params: {
          path: { eventId },
          header: {
            'idempotency-key': idempotencyKey.current,
            'x-hold-key': holdKey,
          },
        },
        body: {
          seatIds: mySeats.map((seat) => seat.id),
          buyerEmail: user?.email ?? buyerEmail,
          buyerName: user?.displayName ?? buyerName,
        },
      });
      if (!response.ok || data === undefined) {
        idempotencyKey.current = crypto.randomUUID();
        toast.error(apiErrorMessage(error, 'Could not claim these seats'));
        if (response.status === 409) {
          refresh();
        }
        return;
      }
      const order = data;
      if (order.status === 'awaiting_payment' && order.payment?.checkoutUrl) {
        window.location.assign(order.payment.checkoutUrl);
        return;
      }
      toast.success('Seats are yours — check your email');
      router.push(`/orders/${order.id}?token=${order.guestToken}`);
    } finally {
      setClaiming(false);
    }
  }

  if (failed) {
    return null;
  }
  if (!map) {
    return <Skeleton className="h-[420px] w-full" />;
  }

  const width = mapWidth(map.meta.maxCols);
  const height = mapHeight(map.meta.totalRows);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg">Pick your seats</CardTitle>
            <CardDescription>
              Seats are held for 7 minutes while you decide. Everyone sees this map live.
            </CardDescription>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              className="size-11 sm:size-7"
              aria-label="Zoom out"
              onClick={viewport.zoomOut}
            >
              <Minus aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              className="size-11 sm:size-7"
              aria-label="Zoom in"
              onClick={viewport.zoomIn}
            >
              <Plus aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              className="size-11 sm:size-7"
              aria-label="Reset view"
              onClick={viewport.reset}
            >
              <RotateCcw aria-hidden="true" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div
          ref={containerRef}
          className="overflow-hidden rounded-xl border border-border bg-background/60"
        >
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full touch-none select-none"
            role="group"
            aria-label="Interactive seat map"
            onPointerDown={viewport.onPointerDown}
            onPointerMove={viewport.onPointerMove}
            onPointerUp={viewport.onPointerUp}
          >
            <g
              transform={`translate(${viewport.pan.x} ${viewport.pan.y}) scale(${viewport.zoom})`}
            >
              <path
                d={`M ${PAD + 8} 30 Q ${width / 2} 2 ${width - PAD - 8} 30`}
                fill="none"
                stroke="var(--seat-selected)"
                strokeWidth="2.5"
                strokeLinecap="round"
                opacity="0.7"
              />
              <text
                x={width / 2}
                y={20}
                textAnchor="middle"
                className="fill-muted-foreground font-mono"
                fontSize="10"
                letterSpacing="4"
              >
                STAGE
              </text>
              {map.meta.sections.map((section) => (
                <text
                  key={section.name}
                  x={seatX(section.xOffset)}
                  y={seatY(section.yStart) - 14}
                  className="fill-muted-foreground font-mono"
                  fontSize="11"
                >
                  {section.name.toUpperCase()}
                </text>
              ))}
              {seatNodes}
            </g>
          </svg>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          {(
            [
              ['available', 'Available'],
              ['held', 'Held by someone'],
              ['mine', 'Yours'],
              ['sold', 'Sold'],
            ] as const
          ).map(([state, label]) => (
            <span key={state} className="flex items-center gap-2 text-xs text-muted-foreground">
              <svg viewBox="0 0 12 12" className="size-3" aria-hidden="true">
                <rect width="12" height="12" rx="3.5" className={seatFill[state]} />
              </svg>
              {label}
            </span>
          ))}
        </div>
        <Separator />
        <form onSubmit={(formEvent) => void claim(formEvent)} className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {mySeats.length === 0 ? (
                <p className="text-sm text-muted-foreground">Tap an available seat to hold it.</p>
              ) : (
                mySeats.map((seat) => (
                  <span
                    key={seat.id}
                    className="rounded-full border border-primary/40 bg-primary/10 px-3 py-1 font-mono text-xs text-primary"
                  >
                    {seatLabel(seat)}
                  </span>
                ))
              )}
            </div>
            <HoldCountdown expiresAt={earliestExpiry} />
          </div>
          {!user && mySeats.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="seatBuyerName">Your name</Label>
                <Input
                  id="seatBuyerName"
                  required
                  maxLength={80}
                  value={buyerName}
                  onChange={(event) => setBuyerName(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="seatBuyerEmail">Email for your tickets</Label>
                <Input
                  id="seatBuyerEmail"
                  type="email"
                  required
                  value={buyerEmail}
                  onChange={(event) => setBuyerEmail(event.target.value)}
                />
              </div>
            </div>
          ) : null}
          <Button type="submit" disabled={mySeats.length === 0 || claiming} className="sm:self-end">
            {claiming
              ? 'Claiming…'
              : mySeats.length === 0
                ? 'Pick seats to continue'
                : `Claim ${mySeats.length} seat${mySeats.length > 1 ? 's' : ''}`}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
