import { ImageResponse } from "next/og";
export const alt = "Countersign — Every payment. The full picture.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default function Image() {
  return new ImageResponse(
    <div
      style={{
        background: "#f7f9f5",
        color: "#173e32",
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
        AGREEMENT-AWARE PAYMENT CONTROL
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
        <span style={{ color: "#427b65" }}>The full picture.</span>
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 20,
          marginTop: 32,
          color: "#66785b",
        }}
      >
        What you agreed. What was accepted. What you already paid.
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
          background: "#e0ebdb",
          borderRadius: 12,
          fontSize: 62,
        }}
      >
        <svg width="68" height="68" viewBox="0 0 68 68" fill="none">
          <path
            d="M12 23L26 37L54 9 M12 43L26 57L54 29"
            stroke="#205c45"
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>,
    { ...size },
  );
}
