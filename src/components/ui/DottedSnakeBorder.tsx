"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";

/**
 * A border drawn as evenly-spaced dots, with a "snake" of enlargement that
 * travels clockwise — dots swell as the wave passes and settle back, like the
 * old phone snake. Pure imperative SVG: positions are computed once per resize,
 * radii are written straight onto the circle refs each frame, so React never
 * re-renders during the animation.
 *
 * Drop it into any `relative` container; it fills the box as an overlay.
 * `active=false` (or reduced motion) leaves a calm, static dotted border.
 */
export function DottedSnakeBorder({
  active = true,
  radius = 8,
  dotGap = 13,
  dotBase = 1.1,
  dotPeak = 3.2,
  speed = 110,
  color = "rgba(255,255,255,0.9)",
  dim = "rgba(255,255,255,0.08)",
}: {
  active?: boolean;
  /** Corner radius of the border path. */
  radius?: number;
  /** Spacing between dots along the perimeter, px. */
  dotGap?: number;
  dotBase?: number;
  dotPeak?: number;
  /** Travel speed of the wave, px/sec. */
  speed?: number;
  color?: string;
  dim?: string;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const pathRef = useRef<SVGPathElement | null>(null);
  const layerRef = useRef<SVGGElement | null>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const wrap = wrapRef.current;
    const svg = svgRef.current;
    const path = pathRef.current;
    const layer = layerRef.current;
    if (!wrap || !svg || !path || !layer) return;

    const SVG_NS = "http://www.w3.org/2000/svg";
    let raf = 0;
    let dots: { el: SVGCircleElement; s: number }[] = [];
    let total = 0;
    let head = 0;
    let last = 0;

    function build() {
      const w = wrap!.clientWidth;
      const h = wrap!.clientHeight;
      if (w === 0 || h === 0) return;
      svg!.setAttribute("width", String(w));
      svg!.setAttribute("height", String(h));
      svg!.setAttribute("viewBox", `0 0 ${w} ${h}`);

      const pad = dotPeak + 1;
      path!.setAttribute("d", roundedRectPath(w, h, radius, pad));
      total = path!.getTotalLength();

      const count = Math.max(8, Math.round(total / dotGap));
      const gap = total / count;
      layer!.replaceChildren();
      dots = [];
      for (let i = 0; i < count; i += 1) {
        const s = i * gap;
        const pt = path!.getPointAtLength(s);
        const c = document.createElementNS(SVG_NS, "circle");
        c.setAttribute("cx", pt.x.toFixed(2));
        c.setAttribute("cy", pt.y.toFixed(2));
        c.setAttribute("r", String(dotBase));
        c.setAttribute("fill", dim);
        layer!.appendChild(c);
        dots.push({ el: c, s });
      }
    }

    function frame(t: number) {
      if (!last) last = t;
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      head = (head + speed * dt) % total;
      const sigma = dotGap * 2.2;
      for (const dot of dots) {
        let d = Math.abs(dot.s - head);
        d = Math.min(d, total - d);
        const g = Math.exp(-(d * d) / (2 * sigma * sigma));
        dot.el.setAttribute("r", (dotBase + (dotPeak - dotBase) * g).toFixed(2));
        dot.el.setAttribute("fill", g > 0.22 ? color : dim);
      }
      raf = requestAnimationFrame(frame);
    }

    build();
    const ro = new ResizeObserver(() => {
      build();
    });
    ro.observe(wrap);

    if (!reduce && active) {
      raf = requestAnimationFrame(frame);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [active, reduce, radius, dotGap, dotBase, dotPeak, speed, color, dim]);

  return (
    <div ref={wrapRef} className="pointer-events-none absolute inset-0" aria-hidden="true">
      <svg ref={svgRef} className="absolute inset-0 overflow-visible">
        <path ref={pathRef} fill="none" stroke="none" />
        <g ref={layerRef} />
      </svg>
    </div>
  );
}

// Clockwise rounded-rect path starting at the top-left corner, inset by `pad`
// so the swollen dots never clip the container edge.
function roundedRectPath(w: number, h: number, r: number, pad: number): string {
  const x0 = pad;
  const y0 = pad;
  const x1 = w - pad;
  const y1 = h - pad;
  const rr = Math.max(0, Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2));
  return [
    `M ${x0 + rr} ${y0}`,
    `L ${x1 - rr} ${y0}`,
    `A ${rr} ${rr} 0 0 1 ${x1} ${y0 + rr}`,
    `L ${x1} ${y1 - rr}`,
    `A ${rr} ${rr} 0 0 1 ${x1 - rr} ${y1}`,
    `L ${x0 + rr} ${y1}`,
    `A ${rr} ${rr} 0 0 1 ${x0} ${y1 - rr}`,
    `L ${x0} ${y0 + rr}`,
    `A ${rr} ${rr} 0 0 1 ${x0 + rr} ${y0}`,
    "Z",
  ].join(" ");
}
