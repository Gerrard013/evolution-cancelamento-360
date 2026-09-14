import SelfServiceStart from "./SelfServiceStart";

export default function Home() {
  return (
    <main className="official-home">
      <nav className="simple-nav">
        <div className="brand-lockup"><div className="brand-dot"/><div><b>EVOLUTION</b><span>Cancelamento Online</span></div></div>
        <a className="nav-link" href="/equipe">Área da equipe</a>
      </nav>
      <section className="official-hero">
        <div className="official-copy">
          <p className="eyebrow">CANAL OFICIAL DE CANCELAMENTO</p>
          <h1>Resolva seu cancelamento online.</h1>
          <p className="lead">Faça todo o pedido pelo portal: localize o contrato, veja os valores aplicáveis, gere o termo, envie o documento assinado e acompanhe pelo protocolo.</p>
          <div className="official-points"><span>Sem e-mail</span><span>Sem fila na recepção</span><span>Protocolo digital</span><span>Termo no próprio portal</span></div>
        </div>
        <SelfServiceStart/>
      </section>
      <footer className="official-footer">Evolution Academia • Unidades Condor e Umarizal</footer>
    </main>
  );
}
