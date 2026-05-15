"use client";

import { useEffect, useMemo, useRef } from "react";
import { useMotionValueEvent, type MotionValue } from "motion/react";

type Pixel = {
  x: number;
  y: number;
  edgeScore: number; // 0 = deep interior, 1 = edge
  noise: number;     // 0..1 random
  deathThreshold: number; // 0..1
  alive: boolean;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
};

/**
 * Type erosion — driven by scroll progress 0→1.
 *
 *   0.0   text rendered intact (opacity 1, all pixels alive)
 *   0.0→1 pixels die (edges first, then interior); each newly-dead
 *         pixel spawns 1-2 outward-drifting white particles that fade
 *   1.0   only stragglers left, fading to nothing
 *
 * Renders absolutely inside its parent. Driven externally; no scroll
 * subscription of its own.
 */
export function TextErosion({
  text,
  progress,
  /** A DOM element whose font/size/spacing the canvas should match exactly.
   *  Pass the visible NOTHING <div> so the canvas raster aligns pixel-for-pixel. */
  matchEl,
  className = "",
}: {
  text: string;
  progress: MotionValue<number>;
  matchEl?: HTMLElement | null;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef<{
    pixels: Pixel[];
    particles: Particle[];
    progress: number;
    width: number;
    height: number;
    dpr: number;
  }>({ pixels: [], particles: [], progress: 0, width: 0, height: 0, dpr: 1 });

  // Subscribe to external progress without re-rendering
  useMotionValueEvent(progress, "change", (v) => {
    stateRef.current.progress = v;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let rafId = 0;

    const resize = () => {
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      stateRef.current.width = w;
      stateRef.current.height = h;
      stateRef.current.dpr = dpr;
    };

    const sample = async () => {
      const w = stateRef.current.width;
      const h = stateRef.current.height;
      if (w === 0 || h === 0) return;

      // Read EXACT typography from the matched DOM element so canvas
      // text aligns pixel-for-pixel with the DOM version we're replacing.
      let fontFamily = '"IBM Plex Sans", system-ui, sans-serif';
      let fontWeight = "500";
      let fontSize = 160;
      let letterSpacing = "0px";
      let domBox: DOMRect | null = null;

      if (matchEl) {
        const cs = window.getComputedStyle(matchEl);
        fontFamily = cs.fontFamily;
        fontWeight = cs.fontWeight;
        fontSize = parseFloat(cs.fontSize);
        letterSpacing = cs.letterSpacing;
        domBox = matchEl.getBoundingClientRect();
      }

      // Wait for the actual font + weight requested.
      // Bypass wait if font is already loaded — avoids needless RAF lag
      // that creates a "blank canvas" window on fast scroll.
      try {
        const fontSpec = `${fontWeight} ${fontSize}px ${fontFamily}`;
        if (!document.fonts.check(fontSpec)) {
          await document.fonts.load(fontSpec);
        }
      } catch {}

      const off = document.createElement("canvas");
      off.width = w;
      off.height = h;
      const oc = off.getContext("2d");
      if (!oc) return;

      oc.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
      oc.fillStyle = "#fff";
      oc.textAlign = "center";
      // Use "alphabetic" baseline (the SAME default the browser uses for
      // DOM text). With "middle" the canvas centre-anchors glyphs, which
      // misaligns vs DOM by a half-cap-height — that was the visible jump.
      oc.textBaseline = "alphabetic";
      try {
        // letterSpacing is supported in Chromium 99+, Safari 16.4+ but not in TS lib
        (oc as unknown as { letterSpacing: string }).letterSpacing = letterSpacing;
      } catch {}

      // Place text so its glyph centre lands EXACTLY on the DOM text's
      // glyph centre.  Using TextMetrics.actualBoundingBox{Ascent,Descent}
      // we find the true visible glyph bounds, then offset baseline so
      // the visual centre matches the DOM bounding-box centre.
      let cx = w / 2;
      let baselineY = h / 2;
      if (domBox && wrap) {
        const wrapBox = wrap.getBoundingClientRect();
        cx = domBox.left + domBox.width / 2 - wrapBox.left;

        const m = oc.measureText(text);
        const ascent = m.actualBoundingBoxAscent;
        const descent = m.actualBoundingBoxDescent;
        const glyphCentreFromBaseline = (ascent - descent) / 2;

        // DOM glyph centre, in canvas coords:
        const domCentreY = domBox.top + domBox.height / 2 - wrapBox.top;
        // baseline = centre + half(ascent-descent)
        baselineY = domCentreY + glyphCentreFromBaseline;
      }
      oc.fillText(text, cx, baselineY);

      const data = oc.getImageData(0, 0, w, h).data;
      // Sample on a grid (2px) for performance
      const STEP = 2;
      const pixels: Pixel[] = [];

      // Build alive grid for edge detection
      const grid = new Uint8Array(Math.ceil(w / STEP) * Math.ceil(h / STEP));
      const cols = Math.ceil(w / STEP);
      for (let y = 0; y < h; y += STEP) {
        for (let x = 0; x < w; x += STEP) {
          const i = (y * w + x) * 4;
          if (data[i + 3] > 128) {
            grid[(y / STEP) * cols + x / STEP] = 1;
          }
        }
      }

      // Edge score: a pixel is "edgy" if some of its 8 neighbours are NOT text
      const seedFor = (x: number, y: number) => {
        let s = (x * 73856093) ^ (y * 19349663);
        s = (s ^ 0xa5a5a5a5) >>> 0;
        return ((s * 1664525 + 1013904223) >>> 0) / 4294967296;
      };

      // Compute text bounding box (in cell coords) for left→right wave
      let minTextX = Infinity;
      let maxTextX = -Infinity;
      for (let i = 0; i < grid.length; i++) {
        if (grid[i] === 1) {
          const x = (i % cols) * STEP;
          if (x < minTextX) minTextX = x;
          if (x > maxTextX) maxTextX = x;
        }
      }
      const textWidth = maxTextX - minTextX || 1;

      for (let y = 0; y < h; y += STEP) {
        for (let x = 0; x < w; x += STEP) {
          const cy = y / STEP;
          const cx = x / STEP;
          if (grid[cy * cols + cx] !== 1) continue;
          let nonTextNeighbours = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nx = cx + dx;
              const ny = cy + dy;
              if (
                nx < 0 ||
                ny < 0 ||
                nx >= cols ||
                ny * cols + nx >= grid.length
              ) {
                nonTextNeighbours++;
                continue;
              }
              if (grid[ny * cols + nx] !== 1) nonTextNeighbours++;
            }
          }
          const edgeScore = nonTextNeighbours / 8;
          const noise = seedFor(x, y);

          // Left→right wave: x-position drives a base ramp 0..1 across
          // the text. Earlier x = earlier death. Combined with edge bias
          // and noise so each letter still crumbles edges-first inside
          // its local wavefront.
          const xRamp = (x - minTextX) / textWidth;          // 0 → 1 across text
          const wavefront = xRamp * 0.65;                    // 65% weight: x-pos
          const edgeBias = (1 - edgeScore) * 0.20;           // 20%: edge-first
          const noiseJitter = noise * 0.15;                  // 15%: noise
          const deathThreshold = wavefront + edgeBias + noiseJitter;

          pixels.push({
            x,
            y,
            edgeScore,
            noise,
            deathThreshold,
            alive: true,
          });
        }
      }
      stateRef.current.pixels = pixels;
      stateRef.current.particles = [];
    };

    const animate = () => {
      const s = stateRef.current;
      const w = s.width;
      const h = s.height;
      ctx.clearRect(0, 0, w, h);

      const p = s.progress;
      const erosionProg = Math.max(0, Math.min(1, p));

      // 1) Walk pixels: alive iff erosion hasn't reached its deathThreshold.
      //    Two-way state — pixels resurrect on scroll-back, particles still
      //    spawn only on the alive→dead transition (one-shot).
      ctx.fillStyle = "#FFFFFF";
      for (const px of s.pixels) {
        const shouldBeAlive = px.deathThreshold > erosionProg;
        const justDied = px.alive && !shouldBeAlive;
        if (justDied) {
          // Spawn 1-2 outward particles on the transition
          const burst = 1 + (px.noise > 0.6 ? 1 : 0);
          for (let k = 0; k < burst; k++) {
            const angle =
              Math.atan2(px.y - h / 2, px.x - w / 2) +
              (Math.random() - 0.5) * 1.2;
            const speed = 0.3 + Math.random() * 1.4;
            s.particles.push({
              x: px.x,
              y: px.y,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed - 0.2 - Math.random() * 0.6,
              age: 0,
              life: 60 + Math.floor(Math.random() * 80),
              size: Math.random() < 0.3 ? 2 : 1,
            });
          }
        }
        px.alive = shouldBeAlive;
        if (px.alive) {
          // Edge pixels close to death get a flicker (subpixel jitter)
          const margin = px.deathThreshold - erosionProg;
          if (margin < 0.05) {
            const j = (Math.random() - 0.5) * 1.6;
            ctx.fillRect(px.x + j, px.y + j, 2, 2);
          } else {
            ctx.fillRect(px.x, px.y, 2, 2);
          }
        }
      }

      // 2) Update + draw particles
      const particles = s.particles;
      let writeIdx = 0;
      for (let i = 0; i < particles.length; i++) {
        const pt = particles[i];
        pt.age++;
        if (pt.age >= pt.life) continue; // skip — drop from list
        pt.x += pt.vx;
        pt.y += pt.vy;
        pt.vy += 0.012; // gentle gravity
        pt.vx *= 0.992;
        pt.vy *= 0.992;
        const alpha = 1 - pt.age / pt.life;
        ctx.globalAlpha = alpha * 0.9;
        ctx.fillRect(pt.x | 0, pt.y | 0, pt.size, pt.size);
        // Compact array (drop dead in-place)
        if (writeIdx !== i) particles[writeIdx] = pt;
        writeIdx++;
      }
      particles.length = writeIdx;
      ctx.globalAlpha = 1;

      rafId = requestAnimationFrame(animate);
    };

    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const onResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        resize();
        sample();
      }, 200);
    };
    window.addEventListener("resize", onResize);

    resize();
    sample();
    rafId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
      if (resizeTimer) clearTimeout(resizeTimer);
    };
  }, [text, matchEl]);

  return (
    <div ref={wrapRef} className={`absolute inset-0 ${className}`}>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
    </div>
  );
}
