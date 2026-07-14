"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";

export function DemoButtons() {
  const { loginDemo } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState<"buyer" | "organizer" | null>(null);

  async function enterDemo(role: "buyer" | "organizer") {
    setBusy(role);
    try {
      await loginDemo(role);
      toast.success(role === "buyer" ? "Signed in as the demo buyer" : "Signed in as the demo organizer");
      router.push(role === "buyer" ? "/events/bangkok-indie-fest" : "/organizer");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Demo login failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <p className="text-sm text-muted-foreground">
      No sign-up needed — jump in as a{" "}
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => void enterDemo("buyer")}
        className="underline underline-offset-4 hover:text-foreground disabled:opacity-50"
      >
        demo buyer
      </button>{" "}
      or a{" "}
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => void enterDemo("organizer")}
        className="underline underline-offset-4 hover:text-foreground disabled:opacity-50"
      >
        demo organizer
      </button>
      .
    </p>
  );
}
