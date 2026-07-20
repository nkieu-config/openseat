"use client";

import { useCallback, useRef, useState } from "react";

export const CELL = 34;
export const GAP = 8;
export const PAD = 44;
export const STEP = CELL + GAP;
export const STAGE_BAND = 36;

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 2.5;
export const ZOOM_STEP = 0.25;
export const DRAG_THRESHOLD_PX = 4;
export const MIN_SEAT_PX = 40;

export type Pan = { x: number; y: number };

export function mapWidth(maxCols: number): number {
  return PAD * 2 + maxCols * STEP - GAP;
}

export function mapHeight(totalRows: number): number {
  return PAD + STAGE_BAND + totalRows * STEP - GAP + PAD;
}

export function seatX(column: number): number {
  return PAD + column * STEP;
}

export function seatY(row: number): number {
  return STAGE_BAND + PAD + row * STEP;
}

export function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

export function seatPixelSize(containerWidth: number, maxCols: number): number {
  const width = mapWidth(maxCols);
  if (containerWidth <= 0 || width <= 0) {
    return 0;
  }
  return (containerWidth * CELL) / width;
}

export function fitZoom(containerWidth: number, maxCols: number): number | null {
  const seatPx = seatPixelSize(containerWidth, maxCols);
  if (seatPx <= 0 || seatPx >= CELL) {
    return null;
  }
  const target = clampZoom(MIN_SEAT_PX / seatPx);
  return target > 1 ? target : null;
}

export function useSeatMapViewport() {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Pan>({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  const zoomIn = useCallback(
    () => setZoom((value) => clampZoom(value + ZOOM_STEP)),
    [],
  );
  const zoomOut = useCallback(
    () => setZoom((value) => clampZoom(value - ZOOM_STEP)),
    [],
  );
  const reset = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const fitToWidth = useCallback((containerWidth: number, maxCols: number) => {
    const target = fitZoom(containerWidth, maxCols);
    if (target === null) {
      return;
    }
    setZoom((current) => (current === 1 ? target : current));
  }, []);

  const onPointerDown = useCallback((event: React.PointerEvent) => {
    drag.current = { x: event.clientX, y: event.clientY, moved: false };
  }, []);

  const onPointerMove = useCallback((event: React.PointerEvent) => {
    const current = drag.current;
    if (!current) {
      return;
    }
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    if (
      !current.moved &&
      Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD_PX
    ) {
      current.moved = true;
      suppressClick.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    if (current.moved) {
      setPan((previous) => ({ x: previous.x + dx, y: previous.y + dy }));
      current.x = event.clientX;
      current.y = event.clientY;
    }
  }, []);

  const onPointerUp = useCallback(() => {
    drag.current = null;
    setTimeout(() => {
      suppressClick.current = false;
    }, 0);
  }, []);

  return {
    zoom,
    pan,
    suppressClick,
    zoomIn,
    zoomOut,
    reset,
    fitToWidth,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  };
}
