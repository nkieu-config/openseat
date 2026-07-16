"use client";

import { Plus, Redo2, Save, Trash2, Undo2 } from "lucide-react";
import {
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { ConsolePanel } from "@/components/console/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, apiErrorMessage } from "@/lib/api";

type Section = {
  id: string;
  name: string;
  tierName: string;
  priceSatang: number;
  rows: number;
  cols: number;
  x: number;
  y: number;
};

const CELL = 18;
const SEAT = 13;
const MIN_COLS = 22;
const MIN_ROWS = 16;
const SECTION_FILLS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

let sectionCounter = 0;
function nextSection(existing: Section[]): Section {
  sectionCounter += 1;
  const index = existing.length + 1;
  const maxY = existing.reduce((max, s) => Math.max(max, s.y + s.rows + 1), 0);
  return {
    id: `s${sectionCounter}-${index}`,
    name: `Section ${index}`,
    tierName: `Tier ${index}`,
    priceSatang: 0,
    rows: 4,
    cols: 8,
    x: 0,
    y: maxY,
  };
}

export function SeatMapEditor({
  eventId,
  onSaved,
}: {
  eventId: string;
  onSaved: () => void;
}) {
  const initial = [nextSection([])];
  const [sections, setSections] = useState<Section[]>(initial);
  const [history, setHistory] = useState<{ stack: Section[][]; index: number }>({
    stack: [initial],
    index: 0,
  });
  const [selectedId, setSelectedId] = useState<string | null>(initial[0].id);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const wasDragging = useRef(false);

  const selected = sections.find((s) => s.id === selectedId) ?? null;
  const canUndo = history.index > 0;
  const canRedo = history.index < history.stack.length - 1;

  function commit(next: Section[]) {
    setSections(next);
    setHistory((current) => {
      const stack = current.stack.slice(0, current.index + 1);
      stack.push(next);
      return { stack, index: stack.length - 1 };
    });
  }

  function undo() {
    if (!canUndo) return;
    const index = history.index - 1;
    setSections(history.stack[index]);
    setHistory({ stack: history.stack, index });
  }

  function redo() {
    if (!canRedo) return;
    const index = history.index + 1;
    setSections(history.stack[index]);
    setHistory({ stack: history.stack, index });
  }

  function addSection() {
    const created = nextSection(sections);
    commit([...sections, created]);
    setSelectedId(created.id);
  }

  function deleteSection(id: string) {
    const next = sections.filter((s) => s.id !== id);
    commit(next.length > 0 ? next : [nextSection([])]);
    setSelectedId(null);
  }

  function patchSelected(patch: Partial<Section>, save: boolean) {
    if (!selectedId) return;
    const next = sections.map((s) =>
      s.id === selectedId ? { ...s, ...patch } : s,
    );
    if (save) {
      commit(next);
    } else {
      setSections(next);
    }
  }

  function gridAt(clientX: number, clientY: number): { gx: number; gy: number } {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { gx: 0, gy: 0 };
    return {
      gx: Math.floor((clientX - rect.left) / CELL),
      gy: Math.floor((clientY - rect.top) / CELL),
    };
  }

  function onSectionMouseDown(event: ReactMouseEvent, id: string) {
    event.preventDefault();
    const section = sections.find((s) => s.id === id);
    if (!section) return;
    const { gx, gy } = gridAt(event.clientX, event.clientY);
    dragRef.current = { id, dx: gx - section.x, dy: gy - section.y };
    setSelectedId(id);
    setDragging(true);
  }

  useEffect(() => {
    if (!dragging) {
      return;
    }
    function move(event: MouseEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      const { gx, gy } = gridAt(event.clientX, event.clientY);
      const nextX = Math.max(0, gx - drag.dx);
      const nextY = Math.max(0, gy - drag.dy);
      setSections((prev) =>
        prev.map((s) => (s.id === drag.id ? { ...s, x: nextX, y: nextY } : s)),
      );
    }
    function up() {
      dragRef.current = null;
      setDragging(false);
    }
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [dragging]);

  useEffect(() => {
    if (dragging) {
      wasDragging.current = true;
      return;
    }
    if (!wasDragging.current) {
      return;
    }
    wasDragging.current = false;
    setHistory((current) => {
      const stack = current.stack.slice(0, current.index + 1);
      stack.push(sections);
      return { stack, index: stack.length - 1 };
    });
  }, [dragging, sections]);

  async function save() {
    const names = sections.map((s) => s.name.trim());
    const tiers = sections.map((s) => s.tierName.trim());
    if (names.some((name) => name === "") || tiers.some((tier) => tier === "")) {
      toast.error("Every section needs a name and a tier");
      return;
    }
    if (new Set(names).size !== names.length) {
      toast.error("Section names must be distinct");
      return;
    }
    if (new Set(tiers).size !== tiers.length) {
      toast.error("Tier names must be distinct");
      return;
    }
    setSaving(true);
    const { error, response } = await api.POST(
      "/api/events/{eventId}/seat-map",
      {
        params: { path: { eventId } },
        body: {
          sections: sections.map((s) => ({
            name: s.name.trim(),
            tierName: s.tierName.trim(),
            priceSatang: s.priceSatang,
            rows: s.rows,
            cols: s.cols,
            x: s.x,
            y: s.y,
          })),
        },
      },
    );
    setSaving(false);
    if (!response.ok) {
      toast.error(apiErrorMessage(error, "Could not save the seat map"));
      return;
    }
    toast.success("Seat map published");
    onSaved();
  }

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
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <ConsolePanel
        label="Layout canvas"
        right={
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {sections.length} sections · {totalSeats} seats
          </span>
        }
      >
        <div className="mb-3 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={addSection}>
            <Plus className="size-4" />
            Section
          </Button>
          <Button size="sm" variant="outline" onClick={undo} disabled={!canUndo}>
            <Undo2 className="size-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={redo} disabled={!canRedo}>
            <Redo2 className="size-4" />
          </Button>
          <Button
            size="sm"
            className="ml-auto"
            onClick={() => void save()}
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
                  className="cursor-grab active:cursor-grabbing"
                  onMouseDown={(event) => onSectionMouseDown(event, section.id)}
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

      <ConsolePanel label={selected ? "Section" : "Inspector"}>
        {selected ? (
          <div className="flex flex-col gap-4">
            <Field label="Name">
              <Input
                value={selected.name}
                onChange={(event) =>
                  patchSelected({ name: event.target.value }, false)
                }
                onBlur={() => commit(sections)}
              />
            </Field>
            <Field label="Tier">
              <Input
                value={selected.tierName}
                onChange={(event) =>
                  patchSelected({ tierName: event.target.value }, false)
                }
                onBlur={() => commit(sections)}
              />
            </Field>
            <Field label="Price (฿)">
              <Input
                type="number"
                min={0}
                value={selected.priceSatang / 100}
                className="font-mono tabular-nums"
                onChange={(event) =>
                  patchSelected(
                    { priceSatang: Math.round(Number(event.target.value) * 100) },
                    true,
                  )
                }
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Rows">
                <Input
                  type="number"
                  min={1}
                  max={26}
                  value={selected.rows}
                  className="font-mono tabular-nums"
                  onChange={(event) =>
                    patchSelected(
                      {
                        rows: Math.min(26, Math.max(1, Number(event.target.value))),
                      },
                      true,
                    )
                  }
                />
              </Field>
              <Field label="Cols">
                <Input
                  type="number"
                  min={1}
                  max={30}
                  value={selected.cols}
                  className="font-mono tabular-nums"
                  onChange={(event) =>
                    patchSelected(
                      {
                        cols: Math.min(30, Math.max(1, Number(event.target.value))),
                      },
                      true,
                    )
                  }
                />
              </Field>
            </div>
            <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {selected.rows * selected.cols} seats
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => deleteSection(selected.id)}
            >
              <Trash2 className="size-4" />
              Remove section
            </Button>
          </div>
        ) : (
          <p className="py-6 text-center font-mono text-xs text-muted-foreground">
            Select a section to edit it.
          </p>
        )}
      </ConsolePanel>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}
