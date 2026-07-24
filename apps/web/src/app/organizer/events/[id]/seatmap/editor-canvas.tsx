"use client";

import { Plus, Redo2, Save, Undo2 } from "lucide-react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from "react";
import { ConsolePanel } from "@/components/console/panel";
import { Button } from "@/components/ui/button";
import {
  CELL,
  MIN_COLS,
  MIN_ROWS,
  SEAT,
  SECTION_FILLS,
  type Section,
} from "@/lib/use-seat-map-draft";

export function EditorCanvas({
  sections,
  selectedId,
  svgRef,
  canUndo,
  canRedo,
  saving,
  onAddSection,
  onUndo,
  onRedo,
  onPublish,
  onSelect,
  onSectionPointerDown,
  onSectionKeyDown,
}: {
  sections: Section[];
  selectedId: string | null;
  svgRef: RefObject<SVGSVGElement | null>;
  canUndo: boolean;
  canRedo: boolean;
  saving: boolean;
  onAddSection: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onPublish: () => void;
  onSelect: (id: string) => void;
  onSectionPointerDown: (event: ReactPointerEvent, id: string) => void;
  onSectionKeyDown: (event: ReactKeyboardEvent, id: string) => void;
}) {
  const cols = Math.max(
    MIN_COLS,
    sections.reduce((max, s) => Math.max(max, s.x + s.cols + 2), 0),
  );
  const rows = Math.max(
    MIN_ROWS,
    sections.reduce((max, s) => Math.max(max, s.y + s.rows + 2), 0),
  );
  const width = cols * CELL;
  const height = rows * CELL;
  const totalSeats = sections.reduce((sum, s) => sum + s.rows * s.cols, 0);

  return (
    <ConsolePanel
      label="Layout canvas"
      right={
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {sections.length} sections · {totalSeats} seats
        </span>
      }
    >
      <div className="mb-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={onAddSection}>
          <Plus className="size-4" />
          Section
        </Button>
        <Button size="sm" variant="outline" onClick={onUndo} disabled={!canUndo}>
          <Undo2 className="size-4" />
        </Button>
        <Button size="sm" variant="outline" onClick={onRedo} disabled={!canRedo}>
          <Redo2 className="size-4" />
        </Button>
        <Button
          size="sm"
          className="ml-auto"
          onClick={onPublish}
          disabled={saving}
        >
          <Save className="size-4" />
          {saving ? "Publishing…" : "Publish map"}
        </Button>
      </div>
      <div className="overflow-auto rounded-md border border-console-line bg-console-groove/40">
        <svg
          ref={svgRef}
          width={width}
          height={height}
          className="touch-none select-none"
        >
          {Array.from({ length: rows + 1 }, (_, r) => (
            <line
              key={`r${r}`}
              x1={0}
              x2={width}
              y1={r * CELL}
              y2={r * CELL}
              stroke="var(--console-line)"
              strokeWidth={1}
            />
          ))}
          {Array.from({ length: cols + 1 }, (_, c) => (
            <line
              key={`c${c}`}
              x1={c * CELL}
              x2={c * CELL}
              y1={0}
              y2={height}
              stroke="var(--console-line)"
              strokeWidth={1}
            />
          ))}
          {sections.map((section, index) => {
            const fill = SECTION_FILLS[index % SECTION_FILLS.length];
            const isSelected = section.id === selectedId;
            return (
              <g
                key={section.id}
                role="button"
                tabIndex={0}
                aria-label={`${section.name || `Section ${index + 1}`}, use arrow keys to move`}
                className="cursor-grab outline-none focus-visible:[outline:2px_solid_var(--primary)] active:cursor-grabbing"
                onPointerDown={(event) => onSectionPointerDown(event, section.id)}
                onFocus={() => onSelect(section.id)}
                onKeyDown={(event) => onSectionKeyDown(event, section.id)}
              >
                {Array.from({ length: section.rows }, (_, r) =>
                  Array.from({ length: section.cols }, (_, c) => (
                    <rect
                      key={`${r}-${c}`}
                      x={(section.x + c) * CELL + (CELL - SEAT) / 2}
                      y={(section.y + r) * CELL + (CELL - SEAT) / 2}
                      width={SEAT}
                      height={SEAT}
                      rx={2}
                      fill={fill}
                      fillOpacity={0.7}
                    />
                  )),
                )}
                <rect
                  x={section.x * CELL + 1}
                  y={section.y * CELL + 1}
                  width={section.cols * CELL - 2}
                  height={section.rows * CELL - 2}
                  rx={4}
                  fill="transparent"
                  stroke={isSelected ? "var(--primary)" : "transparent"}
                  strokeWidth={2}
                />
                <text
                  x={section.x * CELL + 3}
                  y={section.y * CELL - 4}
                  className="fill-muted-foreground font-mono text-[10px] uppercase tracking-wider"
                >
                  {section.name}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        Drag a section to place it · click to edit
      </p>
    </ConsolePanel>
  );
}
