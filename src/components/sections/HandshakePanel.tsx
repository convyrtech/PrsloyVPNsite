"use client";

import { useTransform, type MotionValue } from "motion/react";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

const SEGMENTS = 32;
const CITIES = ["AMS", "FRA", "LON", "NYC", "TYO", "SIN", "SAO"];

/**
 * Mechanical handshake interlude — segmented bar, percentage, status,
 * cities connecting one-by-one. Driven by external scroll progress.
 *
 * Render this inside a parent that handles its own opacity/positioning;
 * the panel itself is just the readout.
 */
export function HandshakePanel({
  progress,
}: {
  progress: MotionValue<number>;
}) {
  const t = useTranslations("bridge");
  const [pct, setPct] = useState(0);

  useEffect(() => {
    const unsubscribe = progress.on("change", (v) => {
      setPct(Math.round(v * 100));
    });
    return unsubscribe;
  }, [progress]);

  const filledSegments = Math.round((pct / 100) * SEGMENTS);
  const connectedCities = Math.min(
    CITIES.length,
    Math.floor((pct / 100) * (CITIES.length + 0.5))
  );
  const isComplete = pct >= 99;

  return (
    <div className="flex flex-col items-center gap-2xl w-full px-lg max-w-5xl pointer-events-none">
      {/* TOP DIVIDER + LABEL */}
      <div className="w-full flex items-center gap-md">
        <div className="h-px flex-1 bg-border-visible/40" />
        <span className="font-mono text-label uppercase tracking-[0.16em] text-text-disabled">
          {isComplete ? t("label_bottom") : t("label_top")}
        </span>
        <div className="h-px flex-1 bg-border-visible/40" />
      </div>

      {/* CENTRAL READOUT */}
      <div className="flex flex-col items-center gap-lg">
        {/* Segmented progress bar */}
        <div className="flex items-end gap-[3px]">
          {Array.from({ length: SEGMENTS }).map((_, i) => {
            const filled = i < filledSegments;
            return (
              <span
                key={i}
                className="block transition-all duration-150 ease-out-nothing"
                style={{
                  width: "10px",
                  height: filled ? "28px" : "16px",
                  background: filled
                    ? isComplete
                      ? "var(--color-text-display)"
                      : "var(--color-text-primary)"
                    : "var(--color-border)",
                }}
              />
            );
          })}
        </div>

        {/* Numeric readout */}
        <div className="flex items-baseline gap-md font-mono">
          <span className="text-text-display text-display-md tracking-[-0.02em] tabular-nums">
            {String(pct).padStart(3, "0")}
            <span className="text-text-disabled">%</span>
          </span>
          <span className="text-label uppercase tracking-[0.08em] text-text-disabled">
            {t("progress_label")}
          </span>
        </div>

        {/* Status row */}
        <div className="flex items-center gap-sm font-mono text-label uppercase tracking-[0.1em]">
          <span
            className={`relative inline-flex w-[6px] h-[6px] rounded-full ${
              isComplete ? "bg-text-display" : "pulse-dot"
            }`}
          />
          <span
            className={isComplete ? "text-text-display" : "text-text-secondary"}
          >
            {isComplete ? "ONLINE" : "HANDSHAKING…"}
          </span>
        </div>
      </div>

      {/* CITY LIST */}
      <div className="flex flex-wrap items-center justify-center gap-md max-w-3xl">
        {CITIES.map((city, i) => {
          const isConnected = i < connectedCities;
          return (
            <span
              key={city}
              className="font-mono text-body-sm tracking-[0.16em] transition-colors duration-200 ease-out-nothing"
              style={{
                color: isConnected
                  ? "var(--color-text-display)"
                  : "var(--color-border-visible)",
              }}
            >
              {city}
              {i < CITIES.length - 1 && (
                <span
                  className="mx-md"
                  style={{
                    color: isConnected
                      ? "var(--color-text-disabled)"
                      : "var(--color-border)",
                  }}
                >
                  ·
                </span>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** Helper: derive handshake progress from main scroll progress (0.35→0.55) */
export function useHandshakeProgress(scrollProgress: MotionValue<number>) {
  return useTransform(scrollProgress, [0.35, 0.55], [0, 1], { clamp: true });
}
