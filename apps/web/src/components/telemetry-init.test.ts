import { describe, expect, it } from "vitest";
import { scrubUrl } from "./telemetry-init";

describe("Faro url scrubbing", () => {
  it("redacts the guest order token", () => {
    expect(scrubUrl("https://x.dev/orders/abc?token=s3cret")).toBe(
      "https://x.dev/orders/abc?token=redacted",
    );
  });

  it("keeps the other params a beacon needs", () => {
    expect(scrubUrl("https://x.dev/orders/abc?payment=failed&token=s3cret")).toBe(
      "https://x.dev/orders/abc?payment=failed&token=redacted",
    );
  });

  it("leaves untouched urls alone", () => {
    expect(scrubUrl("https://x.dev/events/indie")).toBe(
      "https://x.dev/events/indie",
    );
    expect(scrubUrl("https://x.dev/events/indie?locale=th")).toBe(
      "https://x.dev/events/indie?locale=th",
    );
  });
});
