"use client";

// Last-resort boundary: replaces the root layout, so it must render its own
// <html>/<body> and cannot rely on Tailwind/globals — use inline styles.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ru">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "24px",
          background: "#000000",
          color: "#ffffff",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          textAlign: "center",
          padding: "24px",
        }}
      >
        <p style={{ fontSize: "13px", letterSpacing: "2px", color: "#6b6b6b", textTransform: "uppercase" }}>
          [ ERROR ]
        </p>
        <h1 style={{ fontSize: "40px", fontWeight: 700, margin: 0 }}>ЧТО-ТО СЛОМАЛОСЬ.</h1>
        <button
          type="button"
          onClick={reset}
          style={{
            background: "#ffffff",
            color: "#000000",
            border: "none",
            borderRadius: "999px",
            padding: "14px 32px",
            fontFamily: "inherit",
            fontSize: "13px",
            letterSpacing: "1px",
            textTransform: "uppercase",
            cursor: "pointer",
          }}
        >
          [ ОБНОВИТЬ ]
        </button>
      </body>
    </html>
  );
}
