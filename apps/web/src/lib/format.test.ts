import { describe, expect, it } from "vitest";
import {
  formatBaht,
  formatDayLabel,
  formatEventDate,
  formatPercentBp,
  formatPrice,
} from "./format";

describe("money formatting", () => {
  it("formatPrice sells a zero-price tier as Free", () => {
    expect(formatPrice(0)).toBe("Free");
    expect(formatPrice(150_000)).toBe("฿1,500.00");
  });

  it("formatBaht reports zero as an amount, not as Free", () => {
    expect(formatBaht(0)).toBe("฿0");
    expect(formatBaht(150_000)).toBe("฿1,500");
  });

  it("keeps satang precision only when there is a remainder", () => {
    expect(formatBaht(150_050)).toBe("฿1,500.50");
    expect(formatPrice(150_050)).toBe("฿1,500.50");
  });

  it("groups thousands the same way in both formatters", () => {
    expect(formatBaht(123_456_700)).toBe("฿1,234,567");
    expect(formatPrice(123_456_700)).toBe("฿1,234,567.00");
  });
});

describe("percentages", () => {
  it("renders basis points as at most one decimal", () => {
    expect(formatPercentBp(10_000)).toBe("100%");
    expect(formatPercentBp(4_250)).toBe("42.5%");
    expect(formatPercentBp(4_255)).toBe("42.6%");
    expect(formatPercentBp(0)).toBe("0%");
  });
});

describe("dates", () => {
  it("renders in Bangkok time regardless of the machine timezone", () => {
    expect(formatEventDate("2026-07-20T17:00:00.000Z")).toBe(
      "21 Jul 2026, 00:00",
    );
    expect(formatDayLabel("2026-07-20T17:00:00.000Z")).toBe("21 Jul");
  });

  it("accepts a Date as well as an ISO string", () => {
    const iso = "2026-01-01T04:00:00.000Z";
    expect(formatDayLabel(new Date(iso))).toBe(formatDayLabel(iso));
  });
});
