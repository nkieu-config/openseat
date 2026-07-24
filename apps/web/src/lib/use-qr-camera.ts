"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

type DetectedBarcode = { rawValue: string };

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}

type BarcodeDetectorCtor = new (options?: {
  formats?: string[];
}) => BarcodeDetectorLike;

const SCAN_INTERVAL_MS = 450;

function subscribeNoop() {
  return () => {};
}

export type QrCamera = {
  supported: boolean;
  on: boolean;
  error: string | null;
  toggle: () => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
};

export function useQrCamera(onDetect: (value: string) => void): QrCamera {
  const [on, setOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const supported = useSyncExternalStore(
    subscribeNoop,
    () => typeof window !== "undefined" && "BarcodeDetector" in window,
    () => false,
  );

  const toggle = useCallback(() => {
    setError(null);
    setOn((running) => !running);
  }, []);

  useEffect(() => {
    if (!on) {
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
        setError(null);
        timer = window.setInterval(() => {
          const video = videoRef.current;
          if (!video) {
            return;
          }
          void detector
            .detect(video)
            .then((codes) => {
              if (codes.length > 0) {
                onDetect(codes[0].rawValue);
              }
            })
            .catch(() => undefined);
        }, SCAN_INTERVAL_MS);
      } catch {
        setError("Couldn't access the camera. Check permissions.");
        setOn(false);
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
  }, [on, onDetect]);

  return { supported, on, error, toggle, videoRef };
}
