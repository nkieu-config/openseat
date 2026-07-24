"use client";

import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { api, apiErrorMessage } from "@/lib/api/client";

export type Section = {
  id: string;
  name: string;
  tierName: string;
  priceSatang: number;
  rows: number;
  cols: number;
  x: number;
  y: number;
};

export const CELL = 18;
export const SEAT = 13;
export const MIN_COLS = 22;
export const MIN_ROWS = 16;
export const MAX_SECTION_ROWS = 26;
export const MAX_SECTION_COLS = 30;
export const SECTION_FILLS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

const ARROW_DELTAS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

let sectionCounter = 0;

export function nextSection(existing: Section[]): Section {
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

export function useSeatMapDraft(eventId: string, onSaved: () => void) {
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

  function onSectionPointerDown(event: ReactPointerEvent, id: string) {
    event.preventDefault();
    const section = sections.find((s) => s.id === id);
    if (!section) return;
    const { gx, gy } = gridAt(event.clientX, event.clientY);
    dragRef.current = { id, dx: gx - section.x, dy: gy - section.y };
    setSelectedId(id);
    setDragging(true);
  }

  function onSectionKeyDown(event: ReactKeyboardEvent, id: string) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setSelectedId(id);
      return;
    }
    const delta = ARROW_DELTAS[event.key];
    if (!delta) {
      return;
    }
    event.preventDefault();
    setSelectedId(id);
    commit(
      sections.map((s) =>
        s.id === id
          ? {
              ...s,
              x: Math.max(0, s.x + delta[0]),
              y: Math.max(0, s.y + delta[1]),
            }
          : s,
      ),
    );
  }

  useEffect(() => {
    if (!dragging) {
      return;
    }
    function move(event: PointerEvent) {
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
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
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

  async function publish() {
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

  return {
    sections,
    selected,
    selectedId,
    setSelectedId,
    canUndo,
    canRedo,
    saving,
    svgRef,
    commitCurrent: () => commit(sections),
    undo,
    redo,
    addSection,
    deleteSection,
    patchSelected,
    onSectionPointerDown,
    onSectionKeyDown,
    publish,
  };
}
