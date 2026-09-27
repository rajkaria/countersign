import { ImageResponse } from "next/og";
export const alt = "Countersign — Every payment. A second look.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default function Image() {
  return new ImageResponse(
    <div
      style={{
        background: "#f6f7f0",
        color: "#1c352e",
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        padding: "64px 78px",
        fontFamily: "sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: 28,
          fontWeight: 700,
          letterSpacing: -1,
        }}
      >
        Countersign
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 65,
          fontSize: 15,
          letterSpacing: 3,
          color: "#617853",
        }}
      >
        THE PAYMENT CONTROLLER FOR CRYPTO TEAMS
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          fontSize: 82,
          fontWeight: 700,
          lineHeight: 1.03,
          letterSpacing: -4,
          marginTop: 24,
        }}
      >
        <span>Every payment.</span>
        <span>A second look.</span>
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 22,
          marginTop: 32,
          color: "#66785b",
        }}
      >
        What you agreed. What was delivered. What you already paid.
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 62,
          right: 80,
          width: 135,
          height: 135,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#d7edab",
          borderRadius: 70,
          fontSize: 62,
        }}
      >
        <svg width="68" height="68" viewBox="0 0 68 68" fill="none">
          <path
            d="M14 35L28 49L55 20"
            stroke="#1c352e"
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>,
    { ...size },
  );
}
