'use client';

import type { SeatInfo } from '@openseat/contracts';
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
import { api, apiErrorMessage } from '@/lib/api/client';
import { formatSeatLabel } from '@/lib/format';
import { seatX, seatY, useSeatMapViewport } from '@/lib/seat-map-viewport';
import { useSeatHolds } from '@/lib/use-seat-holds';
import { Seat } from './seat';
import { SeatMapCanvas, SeatMapZoomControls } from './seat-map-canvas';

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
  const viewport = useSeatMapViewport();
  const { map, failed, holdKey, mySeats, earliestExpiry, refresh, toggleSeat } =
    useSeatHolds(eventId);

  const [buyerName, setBuyerName] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [claiming, setClaiming] = useState(false);
  const claimingRef = useRef(false);
  const idempotencyKey = useRef<string>(crypto.randomUUID());

  const { suppressClick } = viewport;
  const onSeatToggle = useCallback(
    (seat: SeatInfo) => {
      if (suppressClick.current || claimingRef.current) {
        return;
      }
      void toggleSeat(seat);
    },
    [suppressClick, toggleSeat],
  );

  const seatNodes = useMemo(
    () =>
      (map?.seats ?? []).map((seat) => (
        <Seat
          key={seat.id}
          seat={seat}
          x={seatX(seat.x)}
          y={seatY(seat.y)}
          onToggle={onSeatToggle}
        />
      )),
    [map, onSeatToggle],
  );

  function setClaimingState(value: boolean) {
    claimingRef.current = value;
    setClaiming(value);
  }

  async function claim(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    if (mySeats.length === 0) {
      return;
    }
    setClaimingState(true);
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
      setClaimingState(false);
    }
  }

  if (failed) {
    return null;
  }
  if (!map) {
    return <Skeleton className="h-[420px] w-full" />;
  }

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
          <SeatMapZoomControls viewport={viewport} />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <SeatMapCanvas map={map} viewport={viewport} seatNodes={seatNodes} />
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
                    {formatSeatLabel(seat)}
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
