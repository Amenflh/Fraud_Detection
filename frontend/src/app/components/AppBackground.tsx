"use client";

import { useEffect, useRef } from "react";

type Node = { x: number; y: number; vx: number; vy: number; r: number; flaggedAt: number };

const LINK_DISTANCE = 140;
const CURSOR_DISTANCE = 180;
const FLAG_DURATION = 2600;
const CYAN = "56, 189, 248";
const RED = "248, 113, 113";

/**
 * Fixed full-screen backdrop: gradient orbs, a masked grid, a slow scan line and a
 * canvas "claims network" where random nodes light up red as detected anomalies.
 */
export default function AppBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cursor = { x: -9999, y: -9999 };
    let nodes: Node[] = [];
    let width = 0;
    let height = 0;
    let raf = 0;
    let lastFlag = 0;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas!.width = width * dpr;
      canvas!.height = height * dpr;
      canvas!.style.width = `${width}px`;
      canvas!.style.height = `${height}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      const count = Math.min(95, Math.round((width * height) / 16000));
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        r: 1 + Math.random() * 1.6,
        flaggedAt: -Infinity,
      }));
    }

    function draw(now: number) {
      ctx!.clearRect(0, 0, width, height);

      if (!reducedMotion && now - lastFlag > 1400 && nodes.length) {
        nodes[Math.floor(Math.random() * nodes.length)].flaggedAt = now;
        lastFlag = now;
      }

      for (const n of nodes) {
        if (!reducedMotion) {
          n.x += n.vx;
          n.y += n.vy;
          if (n.x < 0 || n.x > width) n.vx *= -1;
          if (n.y < 0 || n.y > height) n.vy *= -1;
        }
      }

      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        const aHot = now - a.flaggedAt < FLAG_DURATION;
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d > LINK_DISTANCE) continue;
          const hot = aHot || now - b.flaggedAt < FLAG_DURATION;
          ctx!.strokeStyle = `rgba(${hot ? RED : CYAN}, ${(1 - d / LINK_DISTANCE) * (hot ? 0.45 : 0.16)})`;
          ctx!.lineWidth = hot ? 1 : 0.7;
          ctx!.beginPath();
          ctx!.moveTo(a.x, a.y);
          ctx!.lineTo(b.x, b.y);
          ctx!.stroke();
        }

        const dc = Math.hypot(a.x - cursor.x, a.y - cursor.y);
        if (dc < CURSOR_DISTANCE) {
          ctx!.strokeStyle = `rgba(${CYAN}, ${(1 - dc / CURSOR_DISTANCE) * 0.5})`;
          ctx!.lineWidth = 0.8;
          ctx!.beginPath();
          ctx!.moveTo(a.x, a.y);
          ctx!.lineTo(cursor.x, cursor.y);
          ctx!.stroke();
        }
      }

      for (const n of nodes) {
        const age = now - n.flaggedAt;
        if (age < FLAG_DURATION) {
          const t = age / FLAG_DURATION;
          ctx!.strokeStyle = `rgba(${RED}, ${0.8 * (1 - t)})`;
          ctx!.lineWidth = 1.5;
          ctx!.beginPath();
          ctx!.arc(n.x, n.y, 4 + t * 26, 0, Math.PI * 2);
          ctx!.stroke();
        }
        ctx!.fillStyle = age < FLAG_DURATION ? `rgba(${RED}, 0.95)` : `rgba(${CYAN}, 0.55)`;
        ctx!.beginPath();
        ctx!.arc(n.x, n.y, age < FLAG_DURATION ? n.r + 1.2 : n.r, 0, Math.PI * 2);
        ctx!.fill();
      }

      if (!reducedMotion) raf = requestAnimationFrame(draw);
    }

    function onMove(e: PointerEvent) {
      cursor.x = e.clientX;
      cursor.y = e.clientY;
    }
    function onLeave() {
      cursor.x = cursor.y = -9999;
    }

    resize();
    raf = requestAnimationFrame(draw);
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onMove);
    document.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-background">
      <div className="absolute -left-[10%] -top-[15%] size-[55vw] rounded-full bg-cyan-500/15 blur-[120px] animate-float" />
      <div className="absolute -right-[15%] top-[25%] size-[50vw] rounded-full bg-indigo-600/20 blur-[130px] animate-float-slow" />
      <div className="absolute bottom-[-25%] left-[25%] size-[45vw] rounded-full bg-fuchsia-600/10 blur-[140px] animate-float" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgb(255_255_255/0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgb(255_255_255/0.04)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_80%_70%_at_50%_30%,black,transparent)]" />
      <canvas ref={canvasRef} className="absolute inset-0" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/50 to-transparent shadow-[0_0_24px_4px_rgb(34_211_238/0.25)] animate-scan" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgb(5_8_20/0.75))]" />
    </div>
  );
}
