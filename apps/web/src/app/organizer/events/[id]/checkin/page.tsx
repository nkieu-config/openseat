"use client";

import { ArrowLeft, Camera, CameraOff } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback } from "react";
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
import { fetchEventSummary } from "@/lib/api/dashboard";
import { useConsoleGate } from "@/lib/use-console-gate";
import { useDoorScanner } from "@/lib/use-door-scanner";
import { useQrCamera } from "@/lib/use-qr-camera";
import { ResultPanel } from "./result-panel";
import { ScanLog } from "./scan-log";

export default function CheckinConsolePage() {
  const params = useParams<{ id: string }>();
  const eventId = params.id;
  const { loading } = useAuth();

  const loadSummary = useCallback(() => fetchEventSummary(eventId), [eventId]);
  const gate = useConsoleGate(
    `/organizer/events/${eventId}/checkin`,
    loadSummary,
  );
  const scanner = useDoorScanner(eventId);
  const { submitToken } = scanner;
  const onDetect = useCallback(
    (value: string) => void submitToken(value),
    [submitToken],
  );
  const {
    supported: cameraSupported,
    on: cameraOn,
    error: cameraError,
    toggle: toggleCamera,
    videoRef,
  } = useQrCamera(onDetect);

  const eventTitle = gate.data?.title ?? "";
  const sold = gate.data?.ticketsSold ?? 0;
  const checkedIn = (gate.data?.ticketsCheckedIn ?? 0) + scanner.admittedHere;

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
                  <Button variant="outline" size="sm" onClick={toggleCamera}>
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
                  void scanner
                    .submitToken(scanner.token)
                    .then(() => scanner.setToken(""));
                }}
                className="flex flex-col gap-3"
              >
                <Label htmlFor="checkin-token">Ticket QR token</Label>
                <Input
                  id="checkin-token"
                  autoFocus
                  value={scanner.token}
                  onChange={(changeEvent) =>
                    scanner.setToken(changeEvent.target.value)
                  }
                  placeholder="Scan or paste a ticket QR token"
                  className="font-mono"
                />
                <Button
                  type="submit"
                  disabled={scanner.scanning || scanner.token.trim() === ""}
                >
                  {scanner.scanning ? "Checking…" : "Check in"}
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
              <ResultPanel result={scanner.result} />
            </div>
          </div>

          <ScanLog feed={scanner.feed} />
        </div>
      </div>
    </main>
  );
}
