"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";

type CredentialResponse = { credential?: string };

type GoogleIdApi = {
  initialize: (config: {
    client_id: string;
    callback: (response: CredentialResponse) => void;
  }) => void;
  renderButton: (
    parent: HTMLElement,
    options: Record<string, unknown>,
  ) => void;
};

declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdApi } };
  }
}

const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

export function GoogleSignInButton({
  onCredential,
  disabled,
}: {
  onCredential: (credential: string) => Promise<unknown>;
  disabled?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const handlerRef = useRef(onCredential);
  const [scriptLoaded, setScriptLoaded] = useState(false);

  useEffect(() => {
    handlerRef.current = onCredential;
  }, [onCredential]);

  const render = useCallback(() => {
    const container = containerRef.current;
    if (!clientId || !container || !window.google) {
      return;
    }
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: (response) => {
        if (response.credential) {
          void handlerRef.current(response.credential);
        }
      },
    });
    container.innerHTML = "";
    window.google.accounts.id.renderButton(container, {
      type: "standard",
      theme: "outline",
      size: "large",
      text: "continue_with",
      shape: "rectangular",
      logo_alignment: "left",
      width: Math.min(container.offsetWidth || 320, 400),
    });
  }, []);

  useEffect(() => {
    if (scriptLoaded) {
      render();
    }
  }, [scriptLoaded, render]);

  if (!clientId) {
    return null;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
      <div
        ref={containerRef}
        className={disabled ? "pointer-events-none opacity-60" : undefined}
      />
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onLoad={() => setScriptLoaded(true)}
        onReady={() => setScriptLoaded(true)}
      />
    </div>
  );
}
