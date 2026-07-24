"use client";

import { useCallback, useRef, useState } from "react";
import { checkInTicket, type CheckinResult } from "@/lib/api/checkin";

export type ScanTone = "ok" | "warn" | "err";

export type FeedEntry = {
  id: number;
  time: string;
  tone: ScanTone;
  title: string;
  detail: string;
};

export type ScanResult =
  | { tone: ScanTone; heading: string; detail: CheckinResult }
  | { tone: "err"; heading: string; message: string };

const FEED_LIMIT = 25;
const REPEAT_SCAN_WINDOW_MS = 2500;

function timeNow(): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Bangkok",
  }).format(new Date());
}

export type DoorScanner = {
  admittedHere: number;
  token: string;
  setToken: (value: string) => void;
  scanning: boolean;
  result: ScanResult | null;
  feed: FeedEntry[];
  submitToken: (raw: string) => Promise<void>;
};

export function useDoorScanner(eventId: string): DoorScanner {
  const [admittedHere, setAdmittedHere] = useState(0);
  const [token, setToken] = useState("");
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [feed, setFeed] = useState<FeedEntry[]>([]);

  const busyRef = useRef(false);
  const lastScanRef = useRef<{ token: string; at: number } | null>(null);
  const feedIdRef = useRef(0);

  const pushEntry = useCallback((entry: Omit<FeedEntry, "id" | "time">) => {
    const id = (feedIdRef.current += 1);
    setFeed((entries) =>
      [{ id, time: timeNow(), ...entry }, ...entries].slice(0, FEED_LIMIT),
    );
  }, []);

  const submitToken = useCallback(
    async (raw: string) => {
      const value = raw.trim();
      if (!value || busyRef.current) {
        return;
      }
      const now = Date.now();
      if (
        lastScanRef.current &&
        lastScanRef.current.token === value &&
        now - lastScanRef.current.at < REPEAT_SCAN_WINDOW_MS
      ) {
        return;
      }
      lastScanRef.current = { token: value, at: now };
      busyRef.current = true;
      setScanning(true);
      const response = await checkInTicket(eventId, value);
      if (response.ok) {
        const admitted = response.result.outcome === "checked_in";
        const tone: ScanTone = admitted ? "ok" : "warn";
        const seatLabel = response.result.seat ?? response.result.ticketType;
        if (admitted) {
          setAdmittedHere((count) => count + 1);
        }
        setResult({
          tone,
          heading: admitted ? "Admitted" : "Already checked in",
          detail: response.result,
        });
        pushEntry({
          tone,
          title: response.result.attendeeName,
          detail: `${seatLabel} · ${admitted ? "admitted" : "already in"}`,
        });
      } else {
        setResult({ tone: "err", heading: "Rejected", message: response.message });
        pushEntry({ tone: "err", title: "Rejected", detail: response.message });
      }
      setScanning(false);
      busyRef.current = false;
    },
    [eventId, pushEntry],
  );

  return {
    admittedHere,
    token,
    setToken,
    scanning,
    result,
    feed,
    submitToken,
  };
}
