"use client";

import { useEffect, useState } from "react";

export default function Intro({ onFinish }: { onFinish: () => void }) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const a = window.setTimeout(() => setPhase(1), 500);
    const b = window.setTimeout(() => setPhase(2), 1800);
    const c = window.setTimeout(() => setPhase(3), 3200);
    const d = window.setTimeout(onFinish, 4700);
    return () => [a, b, c, d].forEach(window.clearTimeout);
  }, [onFinish]);

  return (
    <section className={`intro phase-${phase}`} aria-label="Introdução Evolution Cancelamento 360">
      <div className="intro-grid" />
      <div className="intro-vignette" />
      <div className="intro-orbit orbit-a" />
      <div className="intro-orbit orbit-b" />
      <div className="intro-orbit orbit-c" />
      <div className="intro-flare" />

      <div className="intro-core">
        <div className="intro-image-shell">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/evolution-intro.jpeg" alt="Evolution Academia" className="intro-image" />
          <div className="scanline" />
        </div>
        <div className="intro-copy">
          <p className="eyebrow">G TECH // EVOLUTION ACADEMIA</p>
          <h1><span>EVO</span>LUTION</h1>
          <h2>CANCELAMENTO <strong>360</strong></h2>
          <p className="intro-status">{phase < 2 ? "INICIALIZANDO WORKFLOW" : "PROCESSO. CONTROLE. RASTREABILIDADE."}</p>
        </div>
      </div>

      <button className="skip-intro" onClick={onFinish}>Pular intro</button>
      <div className="intro-progress"><i /></div>
    </section>
  );
}
