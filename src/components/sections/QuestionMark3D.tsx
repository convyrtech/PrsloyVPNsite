"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * 3D dot-matrix question mark — same Nothing aesthetic as Globe.
 * Slowly rotates on Y axis. Cursor influences tilt subtly.
 *
 * The "?" glyph is rendered to an offscreen canvas, sampled into a
 * point cloud, then each point is given a random Z depth so the result
 * is volumetric, not flat.
 */
export function QuestionMark3D() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let rafId = 0;
    let cleanup: (() => void) | null = null;

    (async () => {
      // ── WebGL probe ──
      const probe = document.createElement("canvas");
      const gl =
        probe.getContext("webgl2") ||
        probe.getContext("webgl") ||
        probe.getContext("experimental-webgl");
      if (!gl) return;

      // Wait for the body font that we'll sample from
      try {
        await document.fonts.load(`bold 600px "IBM Plex Sans"`);
        await document.fonts.ready;
      } catch {}

      // ── Sample "?" glyph into point cloud ──
      const SAMPLE_W = 600;
      const SAMPLE_H = 800;
      const off = document.createElement("canvas");
      off.width = SAMPLE_W;
      off.height = SAMPLE_H;
      const oc = off.getContext("2d");
      if (!oc) return;
      oc.fillStyle = "#fff";
      oc.font = `bold 720px "IBM Plex Sans", system-ui, sans-serif`;
      oc.textAlign = "center";
      oc.textBaseline = "middle";
      oc.fillText("?", SAMPLE_W / 2, SAMPLE_H / 2);
      const data = oc.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data;

      const positions: number[] = [];
      const STEP = 5;
      const SCALE = 0.18; // canvas px → world units
      const DEPTH = 22;
      const seedFor = (x: number, y: number) => {
        let s = (x * 73856093) ^ (y * 19349663);
        s = (s ^ 0xa5a5a5a5) >>> 0;
        return ((s * 1664525 + 1013904223) >>> 0) / 4294967296;
      };

      for (let y = 0; y < SAMPLE_H; y += STEP) {
        for (let x = 0; x < SAMPLE_W; x += STEP) {
          const i = (y * SAMPLE_W + x) * 4;
          if (data[i + 3] > 128) {
            // Centre the cloud at origin
            const wx = (x - SAMPLE_W / 2) * SCALE;
            const wy = -(y - SAMPLE_H / 2) * SCALE;
            // Random Z gives the cloud volume
            const wz = (seedFor(x, y) - 0.5) * DEPTH;
            positions.push(wx, wy, wz);
          }
        }
      }

      // ── Three.js scene ──
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(
        35,
        container.clientWidth / container.clientHeight,
        0.1,
        1000
      );
      camera.position.z = 220;

      const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
      renderer.setSize(container.clientWidth, container.clientHeight, false);
      renderer.setPixelRatio(dpr);

      const cloud = new THREE.Group();
      scene.add(cloud);

      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      const mat = new THREE.PointsMaterial({
        color: 0xe8e8e8,
        size: 0.9,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      });
      cloud.add(new THREE.Points(geo, mat));

      // Slight initial tilt
      cloud.rotation.x = -0.15;

      // ── Cursor parallax ──
      const ptr = { x: 0, y: 0 };
      const onMouseMove = (e: MouseEvent) => {
        const rect = container.getBoundingClientRect();
        ptr.x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
        ptr.y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
      };
      window.addEventListener("mousemove", onMouseMove, { passive: true });

      const onResize = () => {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight, false);
      };
      window.addEventListener("resize", onResize);

      let lastTime = performance.now();
      let targetX = -0.15;

      function animate() {
        const now = performance.now();
        const dt = Math.min(0.05, (now - lastTime) / 1000);
        lastTime = now;

        // Constant slow Y rotation
        cloud.rotation.y += 0.18 * dt;

        // Cursor adds gentle additional tilt (lerped)
        targetX = -0.15 + ptr.y * 0.2;
        cloud.rotation.x += (targetX - cloud.rotation.x) * 0.04;

        renderer.render(scene, camera);
        rafId = requestAnimationFrame(animate);
      }
      rafId = requestAnimationFrame(animate);

      cleanup = () => {
        cancelAnimationFrame(rafId);
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("resize", onResize);
        renderer.dispose();
        geo.dispose();
        mat.dispose();
      };
    })();

    return () => {
      cleanup?.();
    };
  }, []);

  return (
    <div ref={containerRef} className="absolute inset-0">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
    </div>
  );
}
