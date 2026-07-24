// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDoorScanner } from "./use-door-scanner";

const checkInTicket = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/checkin", () => ({ checkInTicket }));

function admitted(attendeeName: string) {
  return {
    ok: true as const,
    result: {
      outcome: "checked_in",
      ticketId: "t1",
      attendeeName,
      ticketType: "Standard",
      seat: "Stalls A4",
      status: "checked_in",
      checkedInAt: "2026-07-24T10:00:00.000Z",
    },
  };
}

describe("useDoorScanner", () => {
  beforeEach(() => {
    checkInTicket.mockReset();
    checkInTicket.mockResolvedValue(admitted("Somchai"));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("counts an admitted ticket and logs it", async () => {
    const { result } = renderHook(() => useDoorScanner("event-1"));

    await act(async () => {
      await result.current.submitToken("  qr-1  ");
    });

    expect(checkInTicket).toHaveBeenCalledWith("event-1", "qr-1");
    expect(result.current.admittedHere).toBe(1);
    expect(result.current.feed[0]?.title).toBe("Somchai");
    expect(result.current.feed[0]?.detail).toBe("Stalls A4 · admitted");
  });

  it("ignores the same token rescanned inside the repeat window", async () => {
    const { result } = renderHook(() => useDoorScanner("event-1"));

    await act(async () => {
      await result.current.submitToken("qr-1");
    });
    await act(async () => {
      await result.current.submitToken("qr-1");
    });

    expect(checkInTicket).toHaveBeenCalledTimes(1);
    expect(result.current.feed).toHaveLength(1);
  });

  it("accepts the same token again once the repeat window has passed", async () => {
    const now = vi.spyOn(Date, "now");
    now.mockReturnValue(0);
    const { result } = renderHook(() => useDoorScanner("event-1"));

    await act(async () => {
      await result.current.submitToken("qr-1");
    });
    now.mockReturnValue(2600);
    await act(async () => {
      await result.current.submitToken("qr-1");
    });

    expect(checkInTicket).toHaveBeenCalledTimes(2);
    now.mockRestore();
  });

  it("keeps only the newest 25 scans", async () => {
    const { result } = renderHook(() => useDoorScanner("event-1"));

    for (let index = 0; index < 30; index += 1) {
      checkInTicket.mockResolvedValueOnce(admitted(`Guest ${index}`));
      await act(async () => {
        await result.current.submitToken(`qr-${index}`);
      });
    }

    expect(result.current.feed).toHaveLength(25);
    expect(result.current.feed[0]?.title).toBe("Guest 29");
  });

  it("reports a rejected scan without counting it", async () => {
    checkInTicket.mockResolvedValue({ ok: false, message: "Ticket already void" });
    const { result } = renderHook(() => useDoorScanner("event-1"));

    await act(async () => {
      await result.current.submitToken("qr-bad");
    });

    expect(result.current.admittedHere).toBe(0);
    expect(result.current.result).toMatchObject({
      tone: "err",
      heading: "Rejected",
      message: "Ticket already void",
    });
  });
});
