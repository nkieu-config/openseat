// @vitest-environment jsdom

import type { SeatMapData } from "@openseat/contracts";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSeatHolds } from "./use-seat-holds";

const apiMock = vi.hoisted(() => ({
  GET: vi.fn(),
  POST: vi.fn(),
  DELETE: vi.fn(),
}));
const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock("@/lib/api/client", () => ({
  api: apiMock,
  apiErrorMessage: (_error: unknown, fallback: string) => fallback,
}));
vi.mock("@/lib/api/realtime", () => ({
  createEventSocket: () => ({
    on: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
  }),
}));
vi.mock("@/lib/hold-key", () => ({ getHoldKey: () => "hold-key-1" }));
vi.mock("sonner", () => ({ toast: toastMock }));

function seatMap(): SeatMapData {
  return {
    id: "map-1",
    template: "theater",
    meta: { maxCols: 4, totalRows: 1, sections: [] },
    tiers: [],
    seats: [
      {
        id: "seat-a",
        section: "Stalls",
        rowLabel: "A",
        number: 4,
        x: 0,
        y: 0,
        ticketTypeId: "tier-1",
        status: "available",
        mine: false,
      },
    ],
  };
}

async function mountWithMap() {
  apiMock.GET.mockResolvedValue({ data: seatMap(), response: { ok: true } });
  const rendered = renderHook(() => useSeatHolds("event-1"));
  await waitFor(() => expect(rendered.result.current.map).not.toBeNull());
  return rendered;
}

describe("useSeatHolds", () => {
  beforeEach(() => {
    apiMock.GET.mockReset();
    apiMock.POST.mockReset();
    apiMock.DELETE.mockReset();
    toastMock.error.mockReset();
    toastMock.success.mockReset();
  });

  afterEach(cleanup);

  it("keeps a seat it won and remembers when the hold expires", async () => {
    const { result } = await mountWithMap();
    apiMock.POST.mockResolvedValue({
      data: { seatId: "seat-a", expiresAt: "2026-07-24T10:07:00.000Z" },
      response: { ok: true, status: 201 },
    });

    await act(async () => {
      await result.current.toggleSeat(result.current.map!.seats[0]!);
    });

    expect(result.current.mySeats.map((seat) => seat.id)).toEqual(["seat-a"]);
    expect(result.current.earliestExpiry).toBe(
      new Date("2026-07-24T10:07:00.000Z").getTime(),
    );
  });

  it("shows the loser of a race the seat as held by someone else", async () => {
    const { result } = await mountWithMap();
    apiMock.POST.mockResolvedValue({
      data: undefined,
      error: { message: "Seat is held by someone else" },
      response: { ok: false, status: 409 },
    });

    await act(async () => {
      await result.current.toggleSeat(result.current.map!.seats[0]!);
    });

    const seat = result.current.map!.seats[0]!;
    expect(seat.status).toBe("held");
    expect(seat.mine).toBe(false);
    expect(result.current.mySeats).toHaveLength(0);
  });

  it("puts the seat back on sale when the hold fails for any other reason", async () => {
    const { result } = await mountWithMap();
    apiMock.POST.mockResolvedValue({
      data: undefined,
      error: { message: "boom" },
      response: { ok: false, status: 500 },
    });

    await act(async () => {
      await result.current.toggleSeat(result.current.map!.seats[0]!);
    });

    const seat = result.current.map!.seats[0]!;
    expect(seat.status).toBe("available");
    expect(seat.mine).toBe(false);
  });

  it("refuses a seat someone else holds without asking the server", async () => {
    const { result } = await mountWithMap();
    const held = { ...result.current.map!.seats[0]!, status: "held" as const };

    await act(async () => {
      await result.current.toggleSeat(held);
    });

    expect(apiMock.POST).not.toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalledWith(
      "Stalls A4 is held by someone else",
    );
  });

  it("releases a seat of its own and refetches when the release is rejected", async () => {
    const { result } = await mountWithMap();
    apiMock.POST.mockResolvedValue({
      data: { seatId: "seat-a", expiresAt: "2026-07-24T10:07:00.000Z" },
      response: { ok: true, status: 201 },
    });
    await act(async () => {
      await result.current.toggleSeat(result.current.map!.seats[0]!);
    });
    apiMock.DELETE.mockResolvedValue({ response: { ok: false, status: 404 } });
    const getCallsBefore = apiMock.GET.mock.calls.length;

    await act(async () => {
      await result.current.toggleSeat(result.current.map!.seats[0]!);
    });

    expect(apiMock.DELETE).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(apiMock.GET.mock.calls.length).toBe(getCallsBefore + 1),
    );
  });
});
