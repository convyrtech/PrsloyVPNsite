import { ImageResponse } from "next/og";

// Default OG/Twitter card image for every route (twitter:card is
// summary_large_image, so a missing image rendered a broken preview).
// Latin-only by design: Satori has no Cyrillic in its default font, and the
// site's brand language is Latin mono labels anyway — so it renders robustly
// without shipping a font file.

export const alt = "PRSLOY — private invite-only VPN";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#000000",
          padding: "84px",
          color: "#ffffff",
        }}
      >
        {/* top eyebrow */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "20px",
            fontSize: "26px",
            letterSpacing: "8px",
            color: "#8a8a8a",
            textTransform: "uppercase",
          }}
        >
          <div
            style={{
              width: "14px",
              height: "14px",
              borderRadius: "999px",
              background: "#d71921",
            }}
          />
          CLOSED BETA
        </div>

        {/* wordmark */}
        <div
          style={{
            display: "flex",
            fontSize: "200px",
            fontWeight: 800,
            letterSpacing: "-4px",
            lineHeight: 1,
          }}
        >
          PRSLOY
        </div>

        {/* tagline */}
        <div
          style={{
            display: "flex",
            fontSize: "40px",
            letterSpacing: "2px",
            color: "#c8c8c8",
            textTransform: "uppercase",
          }}
        >
          PRIVATE ACCESS · INVITE ONLY
        </div>
      </div>
    ),
    { ...size }
  );
}
