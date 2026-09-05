export default function Home() {
  return (
    <main className="simple-home">
      <nav className="simple-nav">
        <div className="brand-lockup">
          <div className="brand-dot" />
          <div><b>EVOLUTION</b><span>Cancelamento 360</span></div>
        </div>
        <a className="nav-link" href="/equipe">Área da equipe</a>
      </nav>

      <section className="simple-hero">
        <div className="simple-copy">
          <p className="eyebrow">CANCELAMENTO DE CONTRATO</p>
          <h1>Seu pedido, do início ao comprovante.</h1>
          <p className="lead">Preencha o pedido, veja a prévia de estorno quando aplicável, gere o termo, assine e envie o documento pelo próprio sistema.</p>
          <div className="hero-actions">
            <a className="btn primary" href="/cliente">Acessar meu pedido</a>
            <a className="btn secondary" href="/equipe">Sou da equipe</a>
          </div>
          <div className="plain-features">
            <div><b>Sem CPF no portal</b><span>O atendimento usa a matrícula EVO para localizar o cadastro.</span></div>
            <div><b>Condor e Umarizal</b><span>A unidade e o plano aparecem de forma clara antes do envio.</span></div>
            <div><b>Termo e protocolo</b><span>O sistema gera o documento e acompanha o pedido até a conclusão.</span></div>
          </div>
        </div>
        <div className="simple-visual glass">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/evolution-intro.jpeg" alt="Evolution Academia" />
          <div className="visual-caption"><b>Evolution Cancelamento 360</b><span>Fluxo digital de cancelamento</span></div>
        </div>
      </section>
    </main>
  );
}
