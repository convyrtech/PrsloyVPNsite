"use client";

import { useEffect, useRef } from "react";
import type { MotionValue } from "motion/react";

type Particle = {
  tx: number;
  ty: number;
  ox: number;
  oy: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  sx: number;
  sy: number;
};

type Mouse = { x: number; y: number; active: boolean };

/**
 * Particle PRSLOY — assembles from chaos, breathes, repels cursor, and
 * disassembles back into chaos on scroll (driven by `exitProgress`).
 * Render this absolutely-positioned behind hero text content.
 */
export function HeroParticles({
  text = "PRSLOY",
  exitProgress,
}: {
  text?: string;
  exitProgress?: MotionValue<number>;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  // Kept in a ref so the RAF loop always reads the live MotionValue without
  // re-running the effect.
  const exitRef = useRef(exitProgress);
  exitRef.current = exitProgress;

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let particles: Particle[] = [];
    const mouse: Mouse = { x: -9999, y: -9999, active: false };
    const startTime = performance.now();
    let rafId = 0;
    let width = 0;
    let height = 0;

    const resize = () => {
      width = wrap.clientWidth;
      height = wrap.clientHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
    };

    const sample = () => {
      const off = document.createElement("canvas");
      off.width = width;
      off.height = height;
      const oc = off.getContext("2d");
      if (!oc) return;

      // Pick font size to fit ~70% of width
      const targetWidth = width * 0.78;
      let fontSize = Math.min(280, Math.max(80, width / 4.2));
      // Doto font (variable, 700 for thicker dots)
      oc.font = `700 ${fontSize}px "Doto", monospace`;
      let measured = oc.measureText(text).width;
      let safety = 60;
      while (measured > targetWidth && fontSize > 40 && safety-- > 0) {
        fontSize -= 4;
        oc.font = `700 ${fontSize}px "Doto", monospace`;
        measured = oc.measureText(text).width;
      }

      oc.fillStyle = "#fff";
      oc.textAlign = "center";
      oc.textBaseline = "middle";
      // Anchor wordmark in upper third so its visual position is consistent
      // across portrait / landscape / square aspect ratios. Hero text lives
      // in the lower third (bottom-positioned), so they never compete.
      oc.fillText(text, width / 2, height * 0.38);

      const data = oc.getImageData(0, 0, width, height).data;
      // Mobile: density 2 (was 4). Doto is itself a dot-matrix glyph — at
      // density 4 the sampling step was coarser than Doto's own dot spacing,
      // so particles landed between dots and the wordmark read as noise.
      // density 2 captures each Doto dot, so the letters resolve.
      const density = window.innerWidth < 768 ? 2 : 3;

      const old = particles;
      particles = [];

      for (let y = 0; y < height; y += density) {
        for (let x = 0; x < width; x += density) {
          const i = (y * width + x) * 4;
          if (data[i + 3] > 128) {
            const reuse = old[particles.length];
            particles.push({
              tx: x,
              ty: y,
              ox: x,
              oy: y,
              x: reuse
                ? reuse.x
                : width / 2 + (Math.random() - 0.5) * width * 1.8,
              y: reuse
                ? reuse.y
                : height / 2 + (Math.random() - 0.5) * height * 1.8,
              vx: reuse ? reuse.vx : 0,
              vy: reuse ? reuse.vy : 0,
              phase: Math.random() * Math.PI * 2,
              // Scatter vector for the exit disassembly: radially outward from
              // the wordmark centre, biased upward. Each particle keeps its
              // own vector so the breakup reads as chaos, not a slide.
              sx: (x - width / 2) * 0.9 + (Math.random() - 0.5) * width * 0.55,
              sy: -(Math.random() * height * 0.5) - height * 0.12,
            });
          }
        }
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
      mouse.active = true;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!e.touches[0]) return;
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.touches[0].clientX - rect.left;
      mouse.y = e.touches[0].clientY - rect.top;
      mouse.active = true;
    };

    const onMouseLeave = () => {
      mouse.active = false;
    };

    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const onResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        resize();
        sample();
      }, 200);
    };

    const animate = () => {
      const now = performance.now();
      const t = now * 0.001;
      const elapsed = (now - startTime) / 1000;

      const exit = exitRef.current ? exitRef.current.get() : 0;

      // Strong assembly pull at start, settles into idle physics. During the
      // exit, stiffen the spring so the scatter tracks the scroll position.
      const spring = exit > 0 || elapsed < 2.0 ? 0.12 : 0.06;
      const friction = elapsed < 2.0 ? 0.78 : 0.84;
      const TWO_PI = Math.PI * 2;

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#FFFFFF";

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // Per-particle exit progress — staggered by phase so the wordmark
        // breaks up as a ripple, not all at once. smoothstep for an eased feel.
        let pe = 0;
        if (exit > 0) {
          const delay = (p.phase / TWO_PI) * 0.35;
          pe = (exit - delay) / (1 - delay);
          pe = pe < 0 ? 0 : pe > 1 ? 1 : pe;
          pe = pe * pe * (3 - 2 * pe);
        }

        // Slow horizontal sine wave through the text
        const wave = Math.sin(t * 0.6 + p.ox * 0.006) * 1.4;
        // Exit displaces the target outward along the scatter vector.
        const tx = p.ox + p.sx * pe;
        const ty = p.oy + wave + p.sy * pe;

        // Brownian jitter — amplifies as the particle scatters (order → chaos)
        const chaos = 1 + pe * 7;
        const jx = (Math.random() - 0.5) * 0.25 * chaos;
        const jy = (Math.random() - 0.5) * 0.25 * chaos;

        // Cursor repulsion
        let pushX = 0;
        let pushY = 0;
        if (mouse.active) {
          const dx = p.x - mouse.x;
          const dy = p.y - mouse.y;
          const d2 = dx * dx + dy * dy;
          const radius = 100;
          if (d2 < radius * radius && d2 > 0.5) {
            const dist = Math.sqrt(d2);
            const tt = (radius - dist) / radius;
            const force = tt * tt * 5;
            pushX = (dx / dist) * force;
            pushY = (dy / dist) * force;
          }
        }

        p.vx += (tx - p.x) * spring + pushX + jx;
        p.vy += (ty - p.y) * spring + pushY + jy;
        p.vx *= friction;
        p.vy *= friction;
        p.x += p.vx;
        p.y += p.vy;

        if (pe < 0.98) {
          ctx.globalAlpha = 1 - pe;
          ctx.fillRect(p.x | 0, p.y | 0, 2, 2);
        }
      }
      ctx.globalAlpha = 1;

      rafId = requestAnimationFrame(animate);
    };

    // Wait for Doto to actually be loaded before sampling, otherwise canvas
    // falls back to monospace and renders solid letters (looks like "sand"
    // instead of dot-matrix glyphs). document.fonts.ready resolves too early
    // on hard-reload because next/font's <link rel=preload> fires it before
    // the woff2 has actually downloaded — we have to explicitly load it.
    const init = async () => {
      resize();
      try {
        if (document.fonts) {
          // Trigger explicit load at multiple sizes/weights we may render
          await Promise.all([
            document.fonts.load('700 200px "Doto"'),
            document.fonts.load('400 200px "Doto"'),
            document.fonts.ready,
          ]);
        }
      } catch {
        /* swallow — fall through to sample anyway */
      }
      // One extra paint tick to be safe
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      sample();

      // Sanity check: if too many particles (means solid fallback font), retry once
      if (particles.length > 12000) {
        await new Promise<void>((r) => setTimeout(r, 250));
        sample();
      }

      rafId = requestAnimationFrame(animate);
    };
    init();

    window.addEventListener("mousemove", onMouseMove, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    document.addEventListener("mouseleave", onMouseLeave);
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("mouseleave", onMouseLeave);
      window.removeEventListener("resize", onResize);
      if (resizeTimer) clearTimeout(resizeTimer);
    };
  }, [text]);

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0 pointer-events-none"
      aria-hidden="true"
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full block"
      />
    </div>
  );
}
