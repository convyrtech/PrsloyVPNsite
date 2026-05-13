"use client";

import { useEffect, useRef } from "react";

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
};

type Mouse = { x: number; y: number; active: boolean };

/**
 * Particle PRSLOY — assembles from chaos, breathes, repels cursor.
 * Render this absolutely-positioned behind hero text content.
 */
export function HeroParticles({ text = "PRSLOY" }: { text?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

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

      // Pick font size that fits ~70% of width — wordmark stays readable.
      // Hero text now sits BELOW the particle (bottom-center), so the wordmark
      // can use the full horizontal space without colliding.
      const targetWidth = width * 0.7;
      let fontSize = Math.min(240, Math.max(72, width / 5));
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
      oc.fillText(text, width / 2, height / 2);

      const data = oc.getImageData(0, 0, width, height).data;
      const density = window.innerWidth < 768 ? 4 : 3;

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

      // Strong assembly pull at start, settles into idle physics
      const spring = elapsed < 2.0 ? 0.12 : 0.06;
      const friction = elapsed < 2.0 ? 0.78 : 0.84;

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#FFFFFF";

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // Slow horizontal sine wave through the text
        const wave = Math.sin(t * 0.6 + p.ox * 0.006) * 1.4;
        const tx = p.ox;
        const ty = p.oy + wave;

        // Subtle brownian jitter
        const jx = (Math.random() - 0.5) * 0.25;
        const jy = (Math.random() - 0.5) * 0.25;

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

        ctx.fillRect(p.x | 0, p.y | 0, 2, 2);
      }

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
