import ClientWizard from "./ClientWizard";

export default function ClientePage() {
  return (
    <main className="portal-page">
      <div className="portal-bg" />
      <a className="back-link" href="/">← Início</a>
      <ClientWizard />
    </main>
  );
}
