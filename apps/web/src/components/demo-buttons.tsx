"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";

type DemoRole = "buyer" | "organizer" | "staff";

export type DemoButtonLabels = {
  noSignup: string;
  buyer: string;
  organizer: string;
  or: string;
  staff: string;
};

const DEMO_MESSAGE: Record<DemoRole, string> = {
  buyer: "Signed in as the demo buyer",
  organizer: "Signed in as the demo organizer",
  staff: "Signed in as the demo door staff",
};

const DEMO_DESTINATION: Record<DemoRole, string> = {
  buyer: "/events/bangkok-indie-fest",
  organizer: "/organizer",
  staff: "/organizer",
};

export function DemoButtons({ labels }: { labels: DemoButtonLabels }) {
  const { loginDemo } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState<DemoRole | null>(null);

  async function enterDemo(role: DemoRole) {
    setBusy(role);
    try {
      await loginDemo(role);
      toast.success(DEMO_MESSAGE[role]);
      router.push(DEMO_DESTINATION[role]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Demo login failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <p className="text-sm text-muted-foreground">
      {labels.noSignup}{" "}
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => void enterDemo("buyer")}
        className="underline underline-offset-4 hover:text-foreground disabled:opacity-50"
      >
        {labels.buyer}
      </button>
      ,{" "}
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => void enterDemo("organizer")}
        className="underline underline-offset-4 hover:text-foreground disabled:opacity-50"
      >
        {labels.organizer}
      </button>
      , {labels.or}{" "}
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => void enterDemo("staff")}
        className="underline underline-offset-4 hover:text-foreground disabled:opacity-50"
      >
        {labels.staff}
      </button>
      .
    </p>
  );
}
