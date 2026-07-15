"use client";

import { Loader2, Users } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  getAdmissionToken,
  isAdmissionValid,
  setAdmissionToken,
} from "@/lib/admission";
import { api } from "@/lib/api";
import {
  getVisitorId,
  joinQueue,
  openQueueStream,
  simulateCrowd,
} from "@/lib/gate";

type EventInfo = { id: string; title: string };

export default function QueuePage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const router = useRouter();
  const [event, setEvent] = useState<EventInfo | null>(null);
  const [state, setState] = useState<"loading" | "queuing" | "error">("loading");
  const [position, setPosition] = useState<number | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [simulating, setSimulating] = useState(false);
  const eventIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let source: EventSource | null = null;

    void (async () => {
      const { data } = await api.GET("/api/events/{slug}", {
        params: { path: { slug } },
      });
      const detail = data as
        | { id: string; title: string; dropMode: boolean }
        | undefined;
      if (cancelled) {
        return;
      }
      if (!detail) {
        setState("error");
        return;
      }
      if (!detail.dropMode || isAdmissionValid(getAdmissionToken(detail.id))) {
        router.replace(`/events/${slug}`);
        return;
      }
      eventIdRef.current = detail.id;
      setEvent({ id: detail.id, title: detail.title });

      const visitorId = getVisitorId(detail.id);
      const joined = await joinQueue(detail.id, visitorId);
      if (cancelled) {
        return;
      }
      if (joined.admitted && joined.token) {
        setAdmissionToken(detail.id, joined.token);
        router.replace(`/events/${slug}`);
        return;
      }
      setPosition(joined.position ?? null);
      setTotal(joined.total ?? null);
      setState("queuing");

      source = openQueueStream(detail.id, visitorId);
      source.addEventListener("position", (messageEvent) => {
        const payload = JSON.parse((messageEvent as MessageEvent).data) as {
          position: number;
          total: number;
        };
        setPosition(payload.position);
        setTotal(payload.total);
      });
      source.addEventListener("admitted", (messageEvent) => {
        const payload = JSON.parse((messageEvent as MessageEvent).data) as {
          token: string;
        };
        setAdmissionToken(detail.id, payload.token);
        source?.close();
        router.replace(`/events/${slug}`);
      });
    })();

    return () => {
      cancelled = true;
      source?.close();
    };
  }, [slug, router]);

  async function onSimulate() {
    const eventId = eventIdRef.current;
    if (!eventId) {
      return;
    }
    setSimulating(true);
    try {
      const result = await simulateCrowd(eventId, 200);
      toast.success(`${result.added} rivals just piled into the queue`);
    } catch {
      toast.error("Could not summon a crowd");
    } finally {
      setSimulating(false);
    }
  }

  if (state === "loading") {
    return (
      <main className="flex flex-1 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </main>
    );
  }
  if (state === "error") {
    return (
      <main className="flex flex-1 items-center justify-center px-4">
        <p className="text-muted-foreground">This on-sale could not be found.</p>
      </main>
    );
  }

  const ahead = position !== null ? Math.max(position - 1, 0) : null;

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="flex w-full max-w-md flex-col items-center gap-6 rounded-2xl border border-border bg-card px-6 py-10 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 font-mono text-xs uppercase tracking-widest text-primary">
          <span className="size-2 animate-pulse rounded-full bg-primary" />
          On-sale live
        </span>
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">{event?.title}</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            You&rsquo;re in the queue
          </h1>
        </div>

        <div className="flex flex-col items-center gap-1">
          <span className="font-mono text-6xl font-semibold tabular-nums text-primary">
            {position ?? "—"}
          </span>
          <span className="text-sm text-muted-foreground">
            your place {total !== null ? `of ${total.toLocaleString()}` : ""}
          </span>
        </div>

        <p className="text-sm text-muted-foreground">
          {ahead === 0
            ? "You're next — hold tight."
            : `${ahead?.toLocaleString()} ahead of you. The line moves automatically.`}
        </p>

        <div className="flex w-full flex-col gap-3">
          <Button
            variant="outline"
            onClick={() => void onSimulate()}
            disabled={simulating}
          >
            <Users className="size-4" />
            {simulating ? "Summoning…" : "Simulate a crowd"}
          </Button>
          <Button variant="ghost" size="sm" render={<Link href={`/events/${slug}`} />}>
            Leave the queue
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Keep this tab open — you&rsquo;ll enter automatically when it&rsquo;s your
          turn.
        </p>
      </div>
    </main>
  );
}
