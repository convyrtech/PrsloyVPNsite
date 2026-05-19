"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import * as THREE from "three";

const GEODATA_URL =
  "https://cdn.jsdelivr.net/gh/holtzy/D3-graph-gallery@master/DATA/world.geojson";

const ORIGIN = { id: "MSK", name: "MOSCOW", lat: 55.7558, lng: 37.6176 };
const DESTINATIONS = [
  { id: "AMS", name: "AMSTERDAM", lat: 52.3676, lng: 4.9041, latencyMs: 24, uptime: 99.8 },
  { id: "FRA", name: "FRANKFURT", lat: 50.1109, lng: 8.6821, latencyMs: 28, uptime: 99.9 },
  { id: "LON", name: "LONDON", lat: 51.5074, lng: -0.1278, latencyMs: 36, uptime: 99.7 },
  { id: "NYC", name: "NEW YORK", lat: 40.7128, lng: -74.006, latencyMs: 92, uptime: 99.5 },
  { id: "TYO", name: "TOKYO", lat: 35.6762, lng: 139.6503, latencyMs: 124, uptime: 99.6 },
  { id: "SIN", name: "SINGAPORE", lat: 1.3521, lng: 103.8198, latencyMs: 138, uptime: 99.4 },
  { id: "SAO", name: "SAO PAULO", lat: -23.5505, lng: -46.6333, latencyMs: 168, uptime: 99.3 },
];

type Hover = { name: string; latencyMs: number; uptime: number; x: number; y: number } | null;

function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  return (
    "ontouchstart" in window ||
    (navigator.maxTouchPoints != null && navigator.maxTouchPoints > 0)
  );
}

function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const lngI = ring[i][0], latI = ring[i][1];
    const lngJ = ring[j][0], latJ = ring[j][1];
    if (
      latI > lat !== latJ > lat &&
      lng < ((lngJ - lngI) * (lat - latI)) / (latJ - latI || 1e-9) + lngI
    ) {
      inside = !inside;
    }
  }
  return inside;
}

export function GlobeImpl({ chrome = true }: { chrome?: boolean }) {
  const t = useTranslations("globe");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hover, setHover] = useState<Hover>(null);
  const [error, setError] = useState<string | null>(null);
  const touch = useRef(false);

  useEffect(() => {
    touch.current = isTouchDevice();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let rafId = 0;
    let cleanup: (() => void) | null = null;

    (async () => {
      // ───── Probe WebGL ─────
      const probe = document.createElement("canvas");
      const gl =
        probe.getContext("webgl2") ||
        probe.getContext("webgl") ||
        probe.getContext("experimental-webgl");
      if (!gl) {
        setError("webgl-missing");
        return;
      }

      // ───── Fetch geodata ─────
      const landPolys: { ring: number[][]; bbox: [number, number, number, number]; isRu: boolean }[] = [];
      try {
        const res = await fetch(GEODATA_URL);
        const geo = await res.json();
        for (const feature of geo.features as { id?: string; properties?: { ISO_A2?: string; iso_a2?: string; name?: string }; geometry: { type: string; coordinates: number[][][] | number[][][][] } }[]) {
          const g = feature.geometry;
          if (!g) continue;
          const props = feature.properties || {};
          const id = props.ISO_A2 || props.iso_a2 || feature.id || "";
          const name = (props.name || "").toLowerCase();
          const isRu = id === "RU" || id === "RUS" || name.includes("russia");
          const polys =
            g.type === "Polygon"
              ? [g.coordinates as number[][][]]
              : g.type === "MultiPolygon"
                ? (g.coordinates as number[][][][])
                : [];
          for (const poly of polys) {
            const outer = poly[0];
            if (!outer || outer.length < 3) continue;
            let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
            for (const [lng, lat] of outer) {
              if (lng < minLng) minLng = lng;
              if (lat < minLat) minLat = lat;
              if (lng > maxLng) maxLng = lng;
              if (lat > maxLat) maxLat = lat;
            }
            landPolys.push({
              ring: outer,
              bbox: [minLng, minLat, maxLng, maxLat],
              isRu,
            });
          }
        }
      } catch (err) {
        console.error("[PRSLOY] failed to load geodata", err);
        setError("geodata-failed");
        return;
      }

      function getLandFlag(lng: number, lat: number): 0 | 1 | 2 {
        let isLand = false;
        let isRu = false;
        for (const p of landPolys) {
          const b = p.bbox;
          if (lng < b[0] || lng > b[2] || lat < b[1] || lat > b[3]) continue;
          if (pointInRing(lng, lat, p.ring)) {
            isLand = true;
            if (p.isRu) {
              isRu = true;
              break;
            }
          }
        }
        return isRu ? 2 : isLand ? 1 : 0;
      }

      // ───── Three.js setup ─────
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const scene = new THREE.Scene();
      scene.background = null;

      const FOV = 35;
      const RADIUS = 80;
      // Target: globe diameter = ~70% of MIN(viewport-w, viewport-h).
      // Without this, fixed camera.z=360 made globe spill off portrait phones
      // (where horizontal visible width is much smaller than vertical).
      const computeCameraZ = (w: number, h: number): number => {
        const aspect = w / h;
        const limiting = Math.min(1, aspect);
        const targetFraction = aspect < 1 ? 0.7 : 0.65;
        const tanHalfFov = Math.tan((FOV * Math.PI / 180) / 2);
        return ((RADIUS * 2) / targetFraction) / (2 * tanHalfFov * limiting);
      };

      const camera = new THREE.PerspectiveCamera(FOV, container.clientWidth / container.clientHeight, 0.1, 2000);
      camera.position.z = computeCameraZ(container.clientWidth, container.clientHeight);

      const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
      renderer.setSize(container.clientWidth, container.clientHeight, false);
      renderer.setPixelRatio(dpr);
      const globe = new THREE.Group();
      scene.add(globe);

      // Opaque base sphere — writes depth, hides back-hemisphere dots
      const baseGeo = new THREE.SphereGeometry(RADIUS - 0.3, 64, 64);
      const baseMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
      globe.add(new THREE.Mesh(baseGeo, baseMat));

      // Faint wireframe
      const wireGeo = new THREE.SphereGeometry(RADIUS - 0.2, 28, 14);
      const wireMat = new THREE.LineBasicMaterial({
        color: 0x1a1a1a,
        transparent: true,
        opacity: 0.5,
      });
      globe.add(new THREE.LineSegments(new THREE.WireframeGeometry(wireGeo), wireMat));

      function latLngToVec3(lat: number, lng: number, r = RADIUS): THREE.Vector3 {
        const phi = ((90 - lat) * Math.PI) / 180;
        const theta = ((lng + 180) * Math.PI) / 180;
        return new THREE.Vector3(
          -r * Math.sin(phi) * Math.cos(theta),
          r * Math.cos(phi),
          r * Math.sin(phi) * Math.sin(theta)
        );
      }

      // ───── Build land dots ─────
      const STEP = 1.6;
      const landPositions: number[] = [];
      const ruPositions: number[] = [];
      for (let lat = -85; lat <= 85; lat += STEP) {
        const lngStep = STEP / Math.max(0.15, Math.cos((lat * Math.PI) / 180));
        for (let lng = -180; lng <= 180; lng += lngStep) {
          const flag = getLandFlag(lng, lat);
          if (flag === 0) continue;
          const v = latLngToVec3(lat, lng, RADIUS + 0.3);
          if (flag === 2) {
            ruPositions.push(v.x, v.y, v.z);
          } else {
            landPositions.push(v.x, v.y, v.z);
          }
        }
      }

      const landGeoBuf = new THREE.BufferGeometry();
      landGeoBuf.setAttribute("position", new THREE.Float32BufferAttribute(landPositions, 3));
      const landMat = new THREE.PointsMaterial({
        color: 0xb8b8b8, size: 0.95, sizeAttenuation: true,
        transparent: true, opacity: 1, depthWrite: false,
      });
      const landDots = new THREE.Points(landGeoBuf, landMat);
      globe.add(landDots);

      const ruGeoBuf = new THREE.BufferGeometry();
      ruGeoBuf.setAttribute("position", new THREE.Float32BufferAttribute(ruPositions, 3));
      const ruMat = new THREE.PointsMaterial({
        color: 0xffffff, size: 1.15, sizeAttenuation: true,
        transparent: true, opacity: 1, depthWrite: false,
      });
      const ruDots = new THREE.Points(ruGeoBuf, ruMat);
      globe.add(ruDots);

      // ───── Origin marker (pulses softer than preview — 3s cycle) ─────
      const originVec = latLngToVec3(ORIGIN.lat, ORIGIN.lng);
      const originGroup = new THREE.Group();
      originGroup.position.copy(originVec.clone().normalize().multiplyScalar(RADIUS + 0.5));
      originGroup.lookAt(0, 0, 0);

      const originRing = new THREE.Mesh(
        new THREE.RingGeometry(1.2, 1.6, 32),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
      );
      originGroup.add(originRing);

      const originCore = new THREE.Mesh(
        new THREE.CircleGeometry(0.6, 16),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      originGroup.add(originCore);

      const pulse = new THREE.Mesh(
        new THREE.RingGeometry(1.5, 1.6, 32),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, side: THREE.DoubleSide })
      );
      originGroup.add(pulse);
      const pulseAnim = { t: 0 };
      globe.add(originGroup);

      // ───── Destinations + arcs + packets ─────
      const hoverableNodes: THREE.Mesh[] = [];

      function slerp(v1: THREE.Vector3, v2: THREE.Vector3, t: number): THREE.Vector3 {
        const cos = Math.max(-1, Math.min(1, v1.clone().normalize().dot(v2.clone().normalize())));
        const omega = Math.acos(cos);
        const sin = Math.sin(omega);
        if (sin < 1e-6) return v1.clone();
        const a = Math.sin((1 - t) * omega) / sin;
        const b = Math.sin(t * omega) / sin;
        return v1.clone().multiplyScalar(a).add(v2.clone().multiplyScalar(b));
      }

      function buildArcPoints(start: THREE.Vector3, end: THREE.Vector3, segments = 64, maxLift = 1.35): THREE.Vector3[] {
        const points: THREE.Vector3[] = [];
        for (let i = 0; i <= segments; i++) {
          const t = i / segments;
          const slerped = slerp(start, end, t);
          const alt = 1 + (maxLift - 1) * Math.sin(t * Math.PI);
          points.push(slerped.normalize().multiplyScalar(RADIUS * alt));
        }
        return points;
      }

      const animatables: ((dt: number) => void)[] = [];

      DESTINATIONS.forEach((dest, idx) => {
        const destVec = latLngToVec3(dest.lat, dest.lng);
        const destGroup = new THREE.Group();
        destGroup.position.copy(destVec.clone().normalize().multiplyScalar(RADIUS + 0.4));
        destGroup.lookAt(0, 0, 0);

        const dot = new THREE.Mesh(
          new THREE.CircleGeometry(0.55, 16),
          new THREE.MeshBasicMaterial({ color: 0xffffff })
        );
        destGroup.add(dot);

        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.9, 1.0, 24),
          new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
        );
        destGroup.add(ring);

        // Larger invisible hit mesh for better hover
        const hitMesh = new THREE.Mesh(
          new THREE.CircleGeometry(2.4, 16),
          new THREE.MeshBasicMaterial({ visible: false })
        );
        hitMesh.userData = { dest };
        destGroup.add(hitMesh);
        hoverableNodes.push(hitMesh);

        globe.add(destGroup);

        // Arc (fades in with stagger)
        const arcPoints = buildArcPoints(originVec, destVec);
        const arcGeo = new THREE.BufferGeometry().setFromPoints(arcPoints);
        const arcMat = new THREE.LineBasicMaterial({
          color: 0xffffff, transparent: true, opacity: 0,
        });
        const arc = new THREE.Line(arcGeo, arcMat);
        globe.add(arc);
        let arcOpacityTarget = 0;
        setTimeout(() => { arcOpacityTarget = 0.4; }, 600 + idx * 180);
        animatables.push(() => {
          if (arc.material.opacity < arcOpacityTarget) {
            (arc.material as THREE.LineBasicMaterial).opacity = Math.min(arcOpacityTarget, arc.material.opacity + 0.012);
          }
        });

        // Packet
        const packet = new THREE.Mesh(
          new THREE.SphereGeometry(0.45, 12, 12),
          new THREE.MeshBasicMaterial({ color: 0xd71921 })
        );
        globe.add(packet);

        // Trail
        const TRAIL_LEN = 22;
        const trailPositions = new Float32Array(TRAIL_LEN * 3);
        const trailColors = new Float32Array(TRAIL_LEN * 3);
        for (let i = 0; i < TRAIL_LEN; i++) {
          const tt = 1 - i / (TRAIL_LEN - 1);
          trailColors[i * 3] = (0xd7 / 255) * tt;
          trailColors[i * 3 + 1] = (0x19 / 255) * tt;
          trailColors[i * 3 + 2] = (0x21 / 255) * tt;
        }
        const trailGeo = new THREE.BufferGeometry();
        trailGeo.setAttribute("position", new THREE.BufferAttribute(trailPositions, 3));
        trailGeo.setAttribute("color", new THREE.BufferAttribute(trailColors, 3));
        const trailMat = new THREE.LineBasicMaterial({
          vertexColors: true, transparent: true,
          blending: THREE.AdditiveBlending, depthWrite: false,
        });
        const trail = new THREE.Line(trailGeo, trailMat);
        trail.visible = false;
        globe.add(trail);

        const trailHistory: THREE.Vector3[] = [];
        const duration = 3.5 + idx * 0.25;
        const startDelay = 1.5 + idx * 0.4;
        const state = { t: -startDelay / duration };

        animatables.push((dt) => {
          state.t += dt / duration;
          if (state.t < 0) {
            packet.visible = false;
            trail.visible = false;
            return;
          }
          packet.visible = true;
          const tw = state.t % 1;
          const idx2 = Math.floor(tw * (arcPoints.length - 1));
          const p = arcPoints[idx2];
          packet.position.copy(p);

          if (tw < 0.05 && trailHistory.length > 5) trailHistory.length = 0;
          trailHistory.push(p.clone());
          if (trailHistory.length > TRAIL_LEN) trailHistory.shift();
          for (let i = 0; i < TRAIL_LEN; i++) {
            const histIdx = trailHistory.length - 1 - i;
            const v = histIdx >= 0 ? trailHistory[histIdx] : trailHistory[0] || p;
            trailPositions[i * 3] = v.x;
            trailPositions[i * 3 + 1] = v.y;
            trailPositions[i * 3 + 2] = v.z;
          }
          trailGeo.attributes.position.needsUpdate = true;
          trail.visible = trailHistory.length >= 3;
        });
      });

      // Pulse animation (softer — 3s cycle)
      animatables.push((dt) => {
        pulseAnim.t = (pulseAnim.t + dt / 3.0) % 1;
        const scale = 1 + pulseAnim.t * 4;
        pulse.scale.set(scale, scale, scale);
        (pulse.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - pulseAnim.t);
      });

      // ───── Initial orientation: Moscow facing camera ─────
      const target = latLngToVec3(ORIGIN.lat, ORIGIN.lng);
      globe.rotation.y = Math.atan2(target.z, target.x) - Math.PI / 2;
      globe.rotation.x = -0.25;

      // ───── Interaction: drag rotate, auto rotate, hover ─────
      let isDragging = false;
      let prevX = 0, prevY = 0;
      let velocityY = 0;
      let lastInteract = 0;

      const raycaster = new THREE.Raycaster();
      const ndc = new THREE.Vector2();
      const ptr = { x: 0, y: 0, active: false };

      const onMouseDown = (e: MouseEvent) => {
        isDragging = true;
        prevX = e.clientX; prevY = e.clientY;
        lastInteract = performance.now();
      };
      const onMouseMove = (e: MouseEvent) => {
        ptr.x = e.clientX; ptr.y = e.clientY; ptr.active = true;
        if (!isDragging) return;
        const dx = e.clientX - prevX, dy = e.clientY - prevY;
        globe.rotation.y += dx * 0.005;
        globe.rotation.x = Math.max(-1.0, Math.min(1.0, globe.rotation.x + dy * 0.005));
        velocityY = dx * 0.005;
        prevX = e.clientX; prevY = e.clientY;
        lastInteract = performance.now();
      };
      const onMouseUp = () => { isDragging = false; };
      const onMouseLeave = () => { ptr.active = false; };

      const onTouchStart = (e: TouchEvent) => {
        if (!e.touches[0]) return;
        isDragging = true;
        prevX = e.touches[0].clientX; prevY = e.touches[0].clientY;
        ptr.x = e.touches[0].clientX; ptr.y = e.touches[0].clientY; ptr.active = true;
        lastInteract = performance.now();
      };
      const onTouchMove = (e: TouchEvent) => {
        if (!isDragging || !e.touches[0]) return;
        const dx = e.touches[0].clientX - prevX, dy = e.touches[0].clientY - prevY;
        globe.rotation.y += dx * 0.005;
        globe.rotation.x = Math.max(-1.0, Math.min(1.0, globe.rotation.x + dy * 0.005));
        velocityY = dx * 0.005;
        prevX = e.touches[0].clientX; prevY = e.touches[0].clientY;
        ptr.x = e.touches[0].clientX; ptr.y = e.touches[0].clientY;
        lastInteract = performance.now();
      };
      const onTouchEnd = () => { isDragging = false; };

      container.addEventListener("mousedown", onMouseDown);
      window.addEventListener("mousemove", onMouseMove, { passive: true });
      window.addEventListener("mouseup", onMouseUp);
      window.addEventListener("mouseleave", onMouseLeave);
      container.addEventListener("touchstart", onTouchStart, { passive: true });
      window.addEventListener("touchmove", onTouchMove, { passive: true });
      window.addEventListener("touchend", onTouchEnd);

      const onResize = () => {
        const w = container.clientWidth;
        const h = container.clientHeight;
        camera.aspect = w / h;
        camera.position.z = computeCameraZ(w, h);
        camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
      };
      window.addEventListener("resize", onResize);

      // ───── Animation loop ─────
      let lastTime = performance.now();
      function animate() {
        const now = performance.now();
        const dt = Math.min(0.05, (now - lastTime) / 1000);
        lastTime = now;

        if (!isDragging) {
          if (Math.abs(velocityY) > 0.0005) {
            globe.rotation.y += velocityY;
            velocityY *= 0.94;
          }
          globe.rotation.y += 0.0006;
          const idle = (now - lastInteract) / 1000;
          if (idle > 2) {
            globe.rotation.x += (-0.25 - globe.rotation.x) * 0.005;
          }
        }

        for (const fn of animatables) fn(dt);

        // Hover detection (skip on touch since it's redundant)
        if (ptr.active && !isDragging && container) {
          const rect = container.getBoundingClientRect();
          ndc.x = ((ptr.x - rect.left) / rect.width) * 2 - 1;
          ndc.y = -((ptr.y - rect.top) / rect.height) * 2 + 1;
          raycaster.setFromCamera(ndc, camera);
          const hits = raycaster.intersectObjects(hoverableNodes, false);
          if (hits.length > 0) {
            const node = hits[0].object as THREE.Mesh;
            const worldPos = new THREE.Vector3();
            node.getWorldPosition(worldPos);
            const camToNode = worldPos.clone().sub(camera.position);
            const camToCenter = new THREE.Vector3().sub(camera.position);
            const nodeProj = camToNode.dot(camToCenter.normalize());
            const centerProj = camToCenter.length();
            const occluded = nodeProj > centerProj && worldPos.length() > centerProj - 5;
            if (!occluded) {
              const dest = node.userData.dest;
              worldPos.project(camera);
              const sx = (worldPos.x * 0.5 + 0.5) * rect.width;
              const sy = (-worldPos.y * 0.5 + 0.5) * rect.height;
              setHover({
                name: dest.name,
                latencyMs: dest.latencyMs,
                uptime: dest.uptime,
                x: sx,
                y: sy,
              });
            } else {
              setHover(null);
            }
          } else {
            setHover(null);
          }
        }

        renderer.render(scene, camera);
        rafId = requestAnimationFrame(animate);
      }
      rafId = requestAnimationFrame(animate);

      cleanup = () => {
        cancelAnimationFrame(rafId);
        container.removeEventListener("mousedown", onMouseDown);
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
        window.removeEventListener("mouseleave", onMouseLeave);
        container.removeEventListener("touchstart", onTouchStart);
        window.removeEventListener("touchmove", onTouchMove);
        window.removeEventListener("touchend", onTouchEnd);
        window.removeEventListener("resize", onResize);
        renderer.dispose();
        scene.traverse((obj) => {
          if (obj instanceof THREE.Mesh || obj instanceof THREE.Line || obj instanceof THREE.Points) {
            obj.geometry?.dispose();
            const m = obj.material;
            if (Array.isArray(m)) m.forEach((mm) => mm.dispose());
            else m?.dispose();
          }
        });
      };
    })();

    return () => {
      cleanup?.();
    };
  }, []);

  if (error) {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-mono text-label uppercase text-text-disabled tracking-[0.16em]">
          [ {t("fallback")} ]
        </span>
      </div>
    );
  }

  return (
    <>
      <div ref={containerRef} className="absolute inset-0">
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block touch-none" />
      </div>

      {hover && (
        <div
          className="absolute z-30 pointer-events-none px-md py-sm rounded-md
                     bg-surface border border-border-visible
                     font-mono text-label uppercase tracking-[0.06em] text-text-primary
                     min-w-[160px]"
          style={{
            left: hover.x,
            top: hover.y,
            transform: "translate(-50%, calc(-100% - 16px))",
          }}
        >
          <div className="text-text-display text-[12px] mb-2">{hover.name}</div>
          <div className="flex justify-between gap-md text-text-secondary">
            <span>LATENCY</span>
            <span className="text-text-display">{hover.latencyMs} MS</span>
          </div>
          <div className="flex justify-between gap-md text-text-secondary">
            <span>UPTIME</span>
            <span className="text-text-display">{hover.uptime.toFixed(1)}%</span>
          </div>
          <div className="flex justify-between gap-md text-text-secondary">
            <span>STATUS</span>
            <span className="text-success">ONLINE</span>
          </div>
        </div>
      )}

      {/* CTA + hint only when chrome enabled (standalone usage).
          When chrome=false (inside ScrollStage), GlobeUIOverlay handles them. */}
      {chrome && (
        <>
          <Link
            href="/pricing"
            className="absolute bottom-2xl right-lg md:bottom-3xl md:right-2xl z-30
                       pointer-events-auto inline-block bg-text-display text-black
                       font-mono text-body-sm uppercase tracking-[0.08em]
                       px-xl py-md rounded-full
                       hover:opacity-90 active:scale-[0.98]
                       transition duration-150 ease-out-nothing"
          >
            [ {t("cta")} ]
          </Link>

          <span
            className="absolute bottom-md left-1/2 -translate-x-1/2 z-30
                       font-mono text-[10px] uppercase tracking-[0.2em] text-text-secondary
                       pointer-events-none"
          >
            {touch.current ? t("hint_touch") : t("hint_desktop")}
          </span>
        </>
      )}
    </>
  );
}
