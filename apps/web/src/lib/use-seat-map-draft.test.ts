// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSeatMapDraft } from "./use-seat-map-draft";

vi.mock("@/lib/api/client", () => ({
  api: { POST: vi.fn() },
  apiErrorMessage: (_error: unknown, fallback: string) => fallback,
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function pointerEventOn(id: string) {
  return {
    preventDefault: () => {},
    clientX: 0,
    clientY: 0,
    sectionId: id,
  } as unknown as React.PointerEvent;
}

describe("useSeatMapDraft", () => {
  afterEach(cleanup);

  it("starts with one section and nothing to undo", () => {
    const { result } = renderHook(() => useSeatMapDraft("event-1", () => {}));

    expect(result.current.sections).toHaveLength(1);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it("walks back and forward through added sections", () => {
    const { result } = renderHook(() => useSeatMapDraft("event-1", () => {}));

    act(() => result.current.addSection());
    expect(result.current.sections).toHaveLength(2);
    expect(result.current.canUndo).toBe(true);

    act(() => result.current.undo());
    expect(result.current.sections).toHaveLength(1);
    expect(result.current.canRedo).toBe(true);

    act(() => result.current.redo());
    expect(result.current.sections).toHaveLength(2);
  });

  it("drops the redo branch once a new edit lands on an undone history", () => {
    const { result } = renderHook(() => useSeatMapDraft("event-1", () => {}));

    act(() => result.current.addSection());
    act(() => result.current.undo());
    act(() => result.current.addSection());

    expect(result.current.canRedo).toBe(false);
    expect(result.current.sections).toHaveLength(2);
  });

  it("keeps an unsaved patch out of the history until it is committed", () => {
    const { result } = renderHook(() => useSeatMapDraft("event-1", () => {}));

    act(() => result.current.patchSelected({ name: "Balcony" }, false));
    expect(result.current.sections[0]?.name).toBe("Balcony");
    expect(result.current.canUndo).toBe(false);

    act(() => result.current.commitCurrent());
    expect(result.current.canUndo).toBe(true);
  });

  it("never leaves the canvas without a section", () => {
    const { result } = renderHook(() => useSeatMapDraft("event-1", () => {}));

    act(() => result.current.deleteSection(result.current.sections[0]!.id));

    expect(result.current.sections).toHaveLength(1);
  });

  it("records the dragged position in the history when the drag ends", () => {
    const { result } = renderHook(() => useSeatMapDraft("event-1", () => {}));
    const id = result.current.sections[0]!.id;
    result.current.svgRef.current = {
      getBoundingClientRect: () => ({ left: 0, top: 0 }) as DOMRect,
    } as unknown as SVGSVGElement;

    act(() => result.current.onSectionPointerDown(pointerEventOn(id), id));
    act(() => {
      window.dispatchEvent(
        new PointerEvent("pointermove", { clientX: 90, clientY: 54 }),
      );
    });
    const moved = result.current.sections[0]!;
    expect(moved.x).toBeGreaterThan(0);
    expect(result.current.canUndo).toBe(false);

    act(() => {
      window.dispatchEvent(new PointerEvent("pointerup"));
    });

    expect(result.current.canUndo).toBe(true);
    act(() => result.current.undo());
    expect(result.current.sections[0]?.x).toBe(0);
  });
});
