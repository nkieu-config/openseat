'use client';

import type { SeatMapData } from '@openseat/contracts';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  PAD,
  mapHeight,
  mapWidth,
  seatX,
  seatY,
  useSeatMapViewport,
} from '@/lib/seat-map-viewport';
import { seatFill } from './seat';

const LEGEND = [
  ['available', 'Available'],
  ['held', 'Held by someone'],
  ['mine', 'Yours'],
  ['sold', 'Sold'],
] as const;

export function SeatMapZoomControls({
  viewport,
}: {
  viewport: ReturnType<typeof useSeatMapViewport>;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        className="size-11 sm:size-7"
        aria-label="Zoom out"
        onClick={viewport.zoomOut}
      >
        <Minus aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        className="size-11 sm:size-7"
        aria-label="Zoom in"
        onClick={viewport.zoomIn}
      >
        <Plus aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        className="size-11 sm:size-7"
        aria-label="Reset view"
        onClick={viewport.reset}
      >
        <RotateCcw aria-hidden="true" />
      </Button>
    </div>
  );
}

export function SeatMapCanvas({
  map,
  viewport,
  seatNodes,
}: {
  map: SeatMapData;
  viewport: ReturnType<typeof useSeatMapViewport>;
  seatNodes: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const width = mapWidth(map.meta.maxCols);
  const height = mapHeight(map.meta.totalRows);
  const { fitToWidth } = viewport;
  const maxCols = map.meta.maxCols;

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }
    fitToWidth(element.clientWidth, maxCols);
  }, [fitToWidth, maxCols]);

  return (
    <>
      <div
        ref={containerRef}
        className="overflow-hidden rounded-xl border border-border bg-background/60"
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full touch-none select-none"
          role="group"
          aria-label="Interactive seat map"
          onPointerDown={viewport.onPointerDown}
          onPointerMove={viewport.onPointerMove}
          onPointerUp={viewport.onPointerUp}
        >
          <g
            transform={`translate(${viewport.pan.x} ${viewport.pan.y}) scale(${viewport.zoom})`}
          >
            <path
              d={`M ${PAD + 8} 30 Q ${width / 2} 2 ${width - PAD - 8} 30`}
              fill="none"
              stroke="var(--seat-selected)"
              strokeWidth="2.5"
              strokeLinecap="round"
              opacity="0.7"
            />
            <text
              x={width / 2}
              y={20}
              textAnchor="middle"
              className="fill-muted-foreground font-mono"
              fontSize="10"
              letterSpacing="4"
            >
              STAGE
            </text>
            {map.meta.sections.map((section) => (
              <text
                key={section.name}
                x={seatX(section.xOffset)}
                y={seatY(section.yStart) - 14}
                className="fill-muted-foreground font-mono"
                fontSize="11"
              >
                {section.name.toUpperCase()}
              </text>
            ))}
            {seatNodes}
          </g>
        </svg>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
        {LEGEND.map(([state, label]) => (
          <span key={state} className="flex items-center gap-2 text-xs text-muted-foreground">
            <svg viewBox="0 0 12 12" className="size-3" aria-hidden="true">
              <rect width="12" height="12" rx="3.5" className={seatFill[state]} />
            </svg>
            {label}
          </span>
        ))}
      </div>
    </>
  );
}
