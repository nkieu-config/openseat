"use client";

import type {
  SeatInfo,
  SeatMapData,
  SeatsChangedMessage,
} from "@openseat/contracts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { api, apiErrorMessage } from "@/lib/api/client";
import { createEventSocket } from "@/lib/api/realtime";
import { formatSeatLabel } from "@/lib/format";
import { getHoldKey } from "@/lib/hold-key";

const EXPIRY_TICK_MS = 1000;

export type SeatHolds = {
  map: SeatMapData | null;
  failed: boolean;
  holdKey: string;
  mySeats: SeatInfo[];
  earliestExpiry: number | null;
  refresh: () => void;
  toggleSeat: (seat: SeatInfo) => Promise<void>;
};

export function useSeatHolds(eventId: string): SeatHolds {
  const [map, setMap] = useState<SeatMapData | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const holdKey = useMemo(() => getHoldKey(), []);
  const earliestExpiryRef = useRef<number | null>(null);

  const refresh = useCallback(() => setReloadKey((key) => key + 1), []);

  useEffect(() => {
    let cancelled = false;
    void api
      .GET("/api/events/{eventId}/seat-map", {
        params: { path: { eventId }, header: { "x-hold-key": holdKey } },
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
    socket.on("seats", (message: SeatsChangedMessage) => {
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
              return { ...seat, status: "sold" as const, mine: false };
            }
            if (released.has(seat.id)) {
              return {
                ...seat,
                status: "available" as const,
                mine: false,
                expiresAt: undefined,
              };
            }
            if (held.has(seat.id) && !seat.mine) {
              return { ...seat, status: "held" as const };
            }
            return seat;
          }),
        };
      });
    });
    return () => {
      socket.emit("leave", { eventId });
      socket.disconnect();
    };
  }, [eventId]);

  const mySeats = useMemo(
    () => (map?.seats ?? []).filter((seat) => seat.mine),
    [map],
  );

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
    if (mySeats.length === 0) {
      return;
    }
    const interval = setInterval(() => {
      const currentNow = Date.now();
      if (
        earliestExpiryRef.current !== null &&
        earliestExpiryRef.current <= currentNow
      ) {
        earliestExpiryRef.current = null;
        toast.error("Your seat holds expired — pick them again");
        refresh();
      }
    }, EXPIRY_TICK_MS);
    return () => clearInterval(interval);
  }, [mySeats.length, refresh]);

  const applySeat = useCallback((seatId: string, patch: Partial<SeatInfo>) => {
    setMap((current) =>
      current
        ? {
            ...current,
            seats: current.seats.map((seat) =>
              seat.id === seatId ? { ...seat, ...patch } : seat,
            ),
          }
        : current,
    );
  }, []);

  const toggleSeat = useCallback(
    async (seat: SeatInfo) => {
      if (seat.status === "sold") {
        return;
      }
      if (seat.mine) {
        applySeat(seat.id, {
          status: "available",
          mine: false,
          expiresAt: undefined,
        });
        const { response } = await api.DELETE(
          "/api/events/{eventId}/holds/{seatId}",
          {
            params: {
              path: { eventId, seatId: seat.id },
              header: { "x-hold-key": holdKey },
            },
          },
        );
        if (!response.ok) {
          refresh();
        }
        return;
      }
      if (seat.status === "held") {
        toast.error(`${formatSeatLabel(seat)} is held by someone else`);
        return;
      }
      applySeat(seat.id, { status: "held", mine: true });
      const { data, error, response } = await api.POST(
        "/api/events/{eventId}/holds",
        {
          params: { path: { eventId }, header: { "x-hold-key": holdKey } },
          body: { seatId: seat.id },
        },
      );
      if (!response.ok || data === undefined) {
        applySeat(seat.id, {
          status: response.status === 409 ? "held" : "available",
          mine: false,
        });
        toast.error(
          apiErrorMessage(error, `Could not hold ${formatSeatLabel(seat)}`),
        );
        return;
      }
      applySeat(seat.id, {
        status: "held",
        mine: true,
        expiresAt: data.expiresAt,
      });
    },
    [applySeat, eventId, holdKey, refresh],
  );

  return {
    map,
    failed,
    holdKey,
    mySeats,
    earliestExpiry,
    refresh,
    toggleSeat,
  };
}
