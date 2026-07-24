"use client";

import { ArrowLeft, Camera, CameraOff } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useAuth } from "@/components/auth-provider";
import {
  ConsoleEventMissing,
  ConsoleLoadFailed,
} from "@/components/console/gate-notice";
import { ConsolePanel, SignalLamp } from "@/components/console/panel";
import { TelemetryStat } from "@/components/console/telemetry";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { checkInTicket, type CheckinResult } from "@/lib/api/checkin";
import { fetchEventSummary } from "@/lib/api/dashboard";
import { useConsoleGate } from "@/lib/use-console-gate";
import { cn } from "@/lib/utils";

type DetectedBarcode = { rawValue: string };
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
type BarcodeDetectorCtor = new (options?: {
  formats?: string[];
}) => BarcodeDetectorLike;

type ScanTone = "ok" | "warn" | "err";
type FeedEntry = {
  id: number;
  time: string;
  tone: ScanTone;
  title: string;
  detail: string;
};
type ScanResult =
  | { tone: ScanTone; heading: string; detail: CheckinResult }
  | { tone: "err"; heading: string; message: string };

function timeNow(): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Bangkok",
  }).format(new Date());
}

function subscribeNoop() {
  return () => {};
}

export default function CheckinConsolePage() {
  const params = useParams<{ id: string }>();
  const eventId = params.id;
  const { loading } = useAuth();

  const [scannedHere, setScannedHere] = useState(0);
  const [token, setToken] = useState("");
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const cameraSupported = useSyncExternalStore(
    subscribeNoop,
    () => typeof window !== "undefined" && "BarcodeDetector" in window,
    () => false,
  );

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const busyRef = useRef(false);
  const lastScanRef = useRef<{ token: string; at: number } | null>(null);
  const feedIdRef = useRef(0);

  const loadSummary = useCallback(
    () => fetchEventSummary(eventId),
    [eventId],
  );
  const gate = useConsoleGate(
    `/organizer/events/${eventId}/checkin`,
    loadSummary,
  );
  const eventTitle = gate.data?.title ?? "";
  const sold = gate.data?.ticketsSold ?? 0;

  const checkedIn = (gate.data?.ticketsCheckedIn ?? 0) + scannedHere;

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
        now - lastScanRef.current.at < 2500
      ) {
        return;
      }
      lastScanRef.current = { token: value, at: now };
      busyRef.current = true;
      setScanning(true);
      const response = await checkInTicket(eventId, value);
      const id = (feedIdRef.current += 1);
      if (response.ok) {
        const admitted = response.result.outcome === "checked_in";
        const tone: ScanTone = admitted ? "ok" : "warn";
        const seatLabel = response.result.seat ?? response.result.ticketType;
        if (admitted) {
          setScannedHere((count) => count + 1);
        }
        setResult({
          tone,
          heading: admitted ? "Admitted" : "Already checked in",
          detail: response.result,
        });
        setFeed((entries) =>
          [
            {
              id,
              time: timeNow(),
              tone,
              title: response.result.attendeeName,
              detail: `${seatLabel} · ${admitted ? "admitted" : "already in"}`,
            },
            ...entries,
          ].slice(0, 25),
        );
      } else {
        setResult({
          tone: "err",
          heading: "Rejected",
          message: response.message,
        });
        setFeed((entries) =>
          [
            {
              id,
              time: timeNow(),
              tone: "err" as const,
              title: "Rejected",
              detail: response.message,
            },
            ...entries,
          ].slice(0, 25),
        );
      }
      setScanning(false);
      busyRef.current = false;
    },
    [eventId],
  );

  useEffect(() => {
    if (!cameraOn) {
      return;
    }
    const detectorCtor = (
      window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }
    ).BarcodeDetector;
    if (!detectorCtor) {
      return;
    }
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    let stopped = false;
    const detector = new detectorCtor({ formats: ["qr_code"] });
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (stopped || !videoRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraError(null);
        timer = window.setInterval(() => {
          const video = videoRef.current;
          if (!video) {
            return;
          }
          void detector
            .detect(video)
            .then((codes) => {
              if (codes.length > 0) {
                void submitToken(codes[0].rawValue);
              }
            })
            .catch(() => undefined);
        }, 450);
      } catch {
        setCameraError("Couldn't access the camera. Check permissions.");
        setCameraOn(false);
      }
    })();
    return () => {
      stopped = true;
      if (timer) {
        window.clearInterval(timer);
      }
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [cameraOn, submitToken]);

  if (loading || gate.state === "loading") {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="font-mono text-sm text-muted-foreground">
          Opening the doors…
        </p>
      </main>
    );
  }
  if (gate.state === "error") {
    return <ConsoleLoadFailed onRetry={gate.reload} />;
  }
  if (gate.state !== "ready") {
    return <ConsoleEventMissing />;
  }

  const remaining = Math.max(sold - checkedIn, 0);

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
            <h1 className="text-3xl font-semibold tracking-tight">Door check-in</h1>
            <p className="text-sm text-muted-foreground">{eventTitle}</p>
          </div>
          <SignalLamp tone="live" label="scanner armed" />
        </header>

        <ConsolePanel label="Turnstile">
          <div className="grid grid-cols-3 gap-x-4 gap-y-6">
            <TelemetryStat label="Admitted" value={checkedIn} hint={`of ${sold}`} />
            <TelemetryStat label="Awaiting" value={remaining} />
            <TelemetryStat
              label="Arrived"
              value={sold > 0 ? `${Math.round((checkedIn / sold) * 100)}%` : "0%"}
            />
          </div>
        </ConsolePanel>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-6">
            <ConsolePanel
              label="Scan bay"
              right={
                cameraSupported ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setCameraError(null);
                      setCameraOn((on) => !on);
                    }}
                  >
                    {cameraOn ? (
                      <CameraOff className="size-4" />
                    ) : (
                      <Camera className="size-4" />
                    )}
                    {cameraOn ? "Stop" : "Camera"}
                  </Button>
                ) : undefined
              }
            >
              <form
                onSubmit={(submitEvent) => {
                  submitEvent.preventDefault();
                  void submitToken(token).then(() => setToken(""));
                }}
                className="flex flex-col gap-3"
              >
                <Label htmlFor="checkin-token">Ticket QR token</Label>
                <Input
                  id="checkin-token"
                  autoFocus
                  value={token}
                  onChange={(changeEvent) => setToken(changeEvent.target.value)}
                  placeholder="Scan or paste a ticket QR token"
                  className="font-mono"
                />
                <Button type="submit" disabled={scanning || token.trim() === ""}>
                  {scanning ? "Checking…" : "Check in"}
                </Button>
              </form>
              {cameraOn ? (
                <div className="mt-3 overflow-hidden rounded-md border border-console-line bg-black">
                  <video
                    ref={videoRef}
                    muted
                    playsInline
                    className="aspect-video w-full object-cover"
                  />
                </div>
              ) : null}
              {cameraError ? (
                <p className="mt-2 text-xs text-destructive">{cameraError}</p>
              ) : null}
            </ConsolePanel>

            <div role="status" aria-live="polite">
              <ResultPanel result={result} />
            </div>
          </div>

          <ConsolePanel
            label="Scan log"
            right={
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                {feed.length}
              </span>
            }
          >
            {feed.length === 0 ? (
              <p className="py-6 text-center font-mono text-xs text-muted-foreground">
                No scans yet — check in the first ticket.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-console-line">
                {feed.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-center gap-3 py-2 first:pt-0 last:pb-0"
                  >
                    <span
                      className={cn(
                        "size-2 shrink-0 rounded-full",
                        entry.tone === "ok" && "bg-signal-live",
                        entry.tone === "warn" && "bg-signal-warn",
                        entry.tone === "err" && "bg-destructive",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{entry.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {entry.detail}
                      </p>
                    </div>
                    <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                      {entry.time}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </ConsolePanel>
        </div>
      </div>
    </main>
  );
}

function ResultPanel({ result }: { result: ScanResult | null }) {
  if (!result) {
    return (
      <ConsolePanel label="Last scan">
        <p className="py-6 text-center font-mono text-xs text-muted-foreground">
          Awaiting a ticket…
        </p>
      </ConsolePanel>
    );
  }
  const toneRing =
    result.tone === "ok"
      ? "border-signal-live/60"
      : result.tone === "warn"
        ? "border-signal-warn/60"
        : "border-destructive/60";
  const toneText =
    result.tone === "ok"
      ? "text-signal-live"
      : result.tone === "warn"
        ? "text-signal-warn"
        : "text-destructive";
  return (
    <ConsolePanel label="Last scan" className={cn("border-2", toneRing)}>
      <div className="flex flex-col gap-2">
        <span
          className={cn(
            "font-mono text-lg font-semibold uppercase tracking-[0.14em]",
            toneText,
          )}
        >
          {result.heading}
        </span>
        {"detail" in result ? (
          <div className="flex flex-col gap-0.5">
            <p className="text-xl font-semibold">{result.detail.attendeeName}</p>
            <p className="text-sm text-muted-foreground">
              {result.detail.seat
                ? `${result.detail.seat} · ${result.detail.ticketType}`
                : result.detail.ticketType}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{result.message}</p>
        )}
      </div>
    </ConsolePanel>
  );
}
