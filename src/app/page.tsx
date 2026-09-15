import SelfServiceStart from "./SelfServiceStart";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
          <p className="lead">Confirme sua identidade com CPF e data de nascimento cadastrados no EVO. O código é enviado somente ao e-mail já registrado na Evolution; depois, confira seu contrato, gere o termo e acompanhe tudo por protocolo.</p>
          <div className="official-points premium-points">
            <span>Validação real no EVO</span><span>OTP no e-mail cadastrado</span><span>Termo digital</span><span>Acompanhamento</span>
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
        <article><span>01</span><b>Identifique-se</b><small>CPF + data de nascimento</small></article>
        <article><span>02</span><b>Confirme o código</b><small>OTP enviado ao e-mail já cadastrado no EVO</small></article>
        <article><span>03</span><b>Solicite</b><small>Contrato, motivo, valores e termo</small></article>
        <article><span>04</span><b>Acompanhe</b><small>Protocolo até a conclusão</small></article>
      </section>

      <footer className="official-footer immersive-footer"><span>Evolution Academia • Condor e Umarizal</span><span>Powered by G Tech • Innovation & Solutions</span></footer>
    </main>
  );
}
