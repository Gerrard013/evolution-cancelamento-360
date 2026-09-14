import SelfServiceStart from "./SelfServiceStart";

export default function Home() {
  return (
    <main className="official-home immersive-home">
      <nav className="simple-nav immersive-nav glass">
        <div className="brand-lockup">
          <div className="brand-dot"/>
          <div><b>EVOLUTION</b><span>Cancelamento Online</span></div>
        </div>
        <div className="nav-actions">
          <span className="live-chip"><i/> Canal digital ativo</span>
          <a className="nav-link" href="/equipe">Área da equipe</a>
        </div>
      </nav>

      <section className="official-hero immersive-hero">
        <div className="official-copy motion-panel">
          <div className="hero-kicker"><span>CANAL OFICIAL</span><i/> EVOLUTION ACADEMIA</div>
          <h1>Seu cancelamento,<br/><em>sem fila e sem e-mail.</em></h1>
          <p className="lead">Localize seu contrato, confira as condições, gere o termo, envie a assinatura e acompanhe tudo por protocolo — em uma única experiência digital.</p>
          <div className="official-points premium-points">
            <span>100% online</span><span>Protocolo imediato</span><span>Termo digital</span><span>Acompanhamento</span>
          </div>

          <div className="experience-visual glass">
            <div className="visual-glow"/>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/evolution-intro.jpeg" alt="Evolution Academia"/>
            <div className="visual-hud">
              <div><small>EXPERIÊNCIA</small><b>EVOLUTION 360</b></div>
              <div><small>STATUS</small><b className="online-text">ONLINE</b></div>
            </div>
          </div>
        </div>

        <div className="service-stage motion-panel">
          <div className="stage-orbit orbit-one"/>
          <div className="stage-orbit orbit-two"/>
          <SelfServiceStart/>
          <div className="stage-caption"><i/> Ambiente seguro • sessão protegida • dados minimizados</div>
        </div>
      </section>

      <section className="experience-strip">
        <article><span>01</span><b>Identifique-se</b><small>Matrícula EVO + nascimento</small></article>
        <article><span>02</span><b>Escolha o contrato</b><small>Plano, unidade e situação</small></article>
        <article><span>03</span><b>Solicite</b><small>Motivo, cálculo e termo</small></article>
        <article><span>04</span><b>Acompanhe</b><small>Protocolo até a conclusão</small></article>
      </section>

      <footer className="official-footer immersive-footer"><span>Evolution Academia • Condor e Umarizal</span><span>Powered by G Tech • Innovation & Solutions</span></footer>
    </main>
  );
}
