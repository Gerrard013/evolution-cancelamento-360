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
          <h1>Cancelamento do início ao comprovante.</h1>
          <p className="lead">A equipe localiza o aluno pela matrícula EVO, confere o contrato e inicia o atendimento. O aluno vê a prévia, gera o termo, assina e envia o documento no próprio sistema.</p>
          <div className="hero-actions">
            <a className="btn primary" href="/equipe">Iniciar atendimento</a>
          </div>
          <div className="plain-features">
            <div><b>Sem CPF no portal</b><span>A matrícula EVO é usada pela equipe para localizar o cadastro.</span></div>
            <div><b>Condor e Umarizal</b><span>Unidade, plano e contrato são conferidos antes do cancelamento.</span></div>
            <div><b>Sem link confuso</b><span>A equipe inicia o atendimento e entrega a tela diretamente ao aluno.</span></div>
            <div><b>Termo + protocolo</b><span>O sistema gera o PDF, recebe o termo assinado e registra o protocolo.</span></div>
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
