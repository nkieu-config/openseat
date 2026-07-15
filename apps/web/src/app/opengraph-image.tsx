import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "OpenSeat — every seat, exactly once";

const seatColors = [
  "#2A3554",
  "#2A3554",
  "#39456B",
  "#2A3554",
  "#F0A73C",
  "#F0A73C",
  "#F0A73C",
  "#2A3554",
  "#39456B",
  "#2A3554",
  "#2A3554",
  "#39456B",
];

export default function OpenGraphImage() {
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
        <div style={{ display: "flex", gap: 14 }}>
          {seatColors.map((color, index) => (
            <div
              key={index}
              style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                backgroundColor: color,
              }}
            />
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", fontSize: 92, fontWeight: 700, color: "#F5F6FA" }}>
            <span>Open</span>
            <span style={{ color: "#F0A73C" }}>Seat</span>
          </div>
          <div style={{ display: "flex", fontSize: 38, color: "#9AA3C0" }}>
            Every seat, exactly once — open ticketing that survives the rush.
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 26, color: "#5C6584" }}>
          openseat-ticket.vercel.app
        </div>
      </div>
    ),
    size,
  );
}
