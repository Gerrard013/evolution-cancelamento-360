"use client";

import { useState } from "react";
import Intro from "@/components/Intro";

export default function Home() {
  const [showIntro, setShowIntro] = useState(true);

  if (showIntro) return <Intro onFinish={() => setShowIntro(false)} />;

  return (
    <main className="landing">
      <nav className="topbar glass">
        <div className="brand-lockup">
          <div className="brand-dot" />
          <div><b>EVOLUTION</b><span>Cancelamento 360</span></div>
        </div>
        <span className="system-chip">MVP ULTRA • G TECH</span>
      </nav>

      <section className="hero-shell">
        <div className="hero-copy">
          <p className="eyebrow">PLATAFORMA OPERACIONAL</p>
          <h1>Cancelamento sem e-mail perdido.<br/><span>Do pedido ao comprovante.</span></h1>
          <p className="lead">Uma experiência mobile-first para o cliente e um painel de alta performance para atendimento, análise, gestão e financeiro.</p>
          <div className="hero-actions">
            <a className="btn primary" href="/cliente">Entrar como cliente</a>
            <a className="btn secondary" href="/equipe">Abrir central da equipe</a>
          </div>
          <div className="signal-row">
            <div><strong>01</strong><span>Protocolo único</span></div>
            <div><strong>02</strong><span>Cálculo explicável</span></div>
            <div><strong>03</strong><span>Auditoria total</span></div>
          </div>
        </div>

        <div className="hero-visual glass">
          <div className="hud-top"><span>EVOLUTION CORE</span><i>ONLINE</i></div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/evolution-intro.jpeg" alt="Identidade visual Evolution" />
          <div className="hud-stats">
            <div><small>EM ABERTO</small><b>12</b></div>
            <div><small>SLA HOJE</small><b>04</b></div>
            <div><small>VALOR</small><b>R$ 8,4k</b></div>
          </div>
        </div>
      </section>

      <section className="feature-grid">
        {[
          ["Fluxo guiado", "Cliente avança etapa por etapa, sem anexos soltos."],
          ["EVO Bridge", "Camada preparada para leitura do W12/EVO sem contaminar o núcleo."],
          ["Motor financeiro", "Regras versionadas, memória de cálculo e dupla conferência."],
          ["Operação em fila", "Prioridade, SLA, unidade, responsável e pendências em um lugar."],
          ["Segurança", "Perfis, alçadas, trilha de auditoria e dados minimizados."],
          ["Gestão", "Motivos, volume, tempo, retrabalho, valores e retenção em dashboards."]
        ].map(([title, text], idx) => (
          <article className="feature-card glass" key={title}>
            <span>0{idx + 1}</span><h3>{title}</h3><p>{text}</p>
          </article>
        ))}
      </section>

      <footer className="footer"><span>Evolution Cancelamento 360</span><span>G Tech • Innovation & Solutions</span></footer>
    </main>
  );
}
