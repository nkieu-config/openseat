import { describe, expect, it } from "vitest";
import {
  CELL,
  MAX_ZOOM,
  MIN_ZOOM,
  clampZoom,
  fitZoom,
  mapHeight,
  mapWidth,
  seatPixelSize,
  seatX,
  seatY,
} from "./seat-map-viewport";

describe("geometry", () => {
  it("lays a row of seats out on a fixed pitch", () => {
    expect(seatX(1) - seatX(0)).toBe(seatX(2) - seatX(1));
    expect(seatY(1) - seatY(0)).toBe(seatX(1) - seatX(0));
  });

  it("leaves padding on both sides of the widest row", () => {
    const columns = 12;
    const width = mapWidth(columns);
    expect(seatX(0)).toBeGreaterThan(0);
    expect(seatX(columns - 1) + CELL).toBeLessThan(width);
  });

  it("grows with the row count", () => {
    expect(mapHeight(10)).toBeGreaterThan(mapHeight(5));
  });
});

describe("clampZoom", () => {
  it("keeps zoom inside the supported range", () => {
    expect(clampZoom(0.1)).toBe(MIN_ZOOM);
    expect(clampZoom(99)).toBe(MAX_ZOOM);
    expect(clampZoom(1.25)).toBe(1.25);
  });
});

describe("fitZoom", () => {
  it("zooms in when a phone would render seats too small to tap", () => {
    const phone = 309;
    const columns = 12;
    expect(seatPixelSize(phone, columns)).toBeLessThan(CELL);

    const zoom = fitZoom(phone, columns);
    expect(zoom).not.toBeNull();
    expect(seatPixelSize(phone, columns) * zoom!).toBeGreaterThanOrEqual(40);
  });

  it("leaves a roomy desktop viewport alone", () => {
    expect(fitZoom(1200, 12)).toBeNull();
  });

  it("never zooms past the maximum, however narrow the screen", () => {
    expect(fitZoom(80, 40)).toBeLessThanOrEqual(MAX_ZOOM);
  });

  it("reports nothing to do when it has not been measured yet", () => {
    expect(fitZoom(0, 12)).toBeNull();
  });
});
