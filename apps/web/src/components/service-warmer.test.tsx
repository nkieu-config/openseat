// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServiceWarmer } from "./service-warmer";

describe("ServiceWarmer", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("knocks on every origin it is given, once each", () => {
    render(<ServiceWarmer origins={["https://pay.example", "https://gate.example"]} />);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "https://pay.example/health",
      "https://gate.example/health",
    ]);
  });

  it("asks for a wake-up no cache can answer on its behalf", () => {
    render(<ServiceWarmer origins={["https://pay.example"]} />);

    expect(fetchMock.mock.calls[0][1]).toMatchObject({ mode: "no-cors", cache: "no-store" });
  });

  it("stays quiet when the page needs nothing woken", () => {
    render(<ServiceWarmer origins={[]} />);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("swallows the refusal a still-sleeping service returns", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    render(<ServiceWarmer origins={["https://asleep.example"]} />);

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });
});
