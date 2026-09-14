"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import Intro from "./Intro";

export default function ImmersiveShell({ children }: { children: ReactNode }) {
  const [showIntro, setShowIntro] = useState(true);
  const shellRef = useRef<HTMLDivElement>(null);

  const finishIntro = useCallback(() => setShowIntro(false), []);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;

    let frame = 0;
    const move = (event: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        shell.style.setProperty("--mx", `${event.clientX}px`);
        shell.style.setProperty("--my", `${event.clientY}px`);
      });
    };

    const press = (event: PointerEvent) => {
      const ripple = document.createElement("span");
      ripple.className = "gtech-ripple";
      ripple.style.left = `${event.clientX}px`;
      ripple.style.top = `${event.clientY}px`;
      shell.appendChild(ripple);
      window.setTimeout(() => ripple.remove(), 680);
    };

    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerdown", press, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", press);
    };
  }, []);

  return (
    <>
      {showIntro ? <Intro onFinish={finishIntro} /> : null}
      <div ref={shellRef} className={`immersive-shell ${showIntro ? "waiting-intro" : "experience-ready"}`}>
        <div className="ambient-orb ambient-orb-a" aria-hidden="true" />
        <div className="ambient-orb ambient-orb-b" aria-hidden="true" />
        <div className="ambient-orb ambient-orb-c" aria-hidden="true" />
        <div className="ambient-grid" aria-hidden="true" />
        {children}
      </div>
    </>
  );
}
