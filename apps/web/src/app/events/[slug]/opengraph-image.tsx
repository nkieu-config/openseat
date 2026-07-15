import type { EventDetail } from "@openseat/contracts";
import { ImageResponse } from "next/og";
import { apiBaseUrl } from "@/lib/api";
import { formatEventDate } from "@/lib/format";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Event tickets on OpenSeat";

const seatColors = [
  "#2A3554",
  "#39456B",
  "#F0A73C",
  "#2A3554",
  "#39456B",
  "#2A3554",
  "#F0A73C",
  "#2A3554",
];

export default async function EventOpenGraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let title = "Get tickets on OpenSeat";
  let meta = "Free tickets · QR entry";
  try {
    const res = await fetch(`${apiBaseUrl}/api/events/${encodeURIComponent(slug)}`, {
      cache: "no-store",
    });
    if (res.ok) {
      const event = (await res.json()) as EventDetail;
      title = event.title;
      meta = `${formatEventDate(event.startsAt)} · ${event.venueName}`;
    }
  } catch {
    title = "Get tickets on OpenSeat";
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#101830",
          padding: 80,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", fontSize: 36, fontWeight: 700, color: "#F5F6FA" }}>
            <span>Open</span>
            <span style={{ color: "#F0A73C" }}>Seat</span>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            {seatColors.map((color, index) => (
              <div
                key={index}
                style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: color }}
              />
            ))}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div
            style={{
              display: "flex",
              fontSize: title.length > 28 ? 64 : 84,
              fontWeight: 700,
              color: "#F5F6FA",
              lineHeight: 1.1,
            }}
          >
            {title}
          </div>
          <div style={{ display: "flex", fontSize: 34, color: "#9AA3C0" }}>{meta}</div>
        </div>
        <div style={{ display: "flex", fontSize: 26, color: "#F0A73C" }}>
          Claim your ticket — free, no account needed
        </div>
      </div>
    ),
    size,
  );
}
