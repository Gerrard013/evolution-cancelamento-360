import ClientWizard from "./ClientWizard";

export default function ClientePage() {
  return (
    <main className="portal-page">
      <div className="portal-bg" />
      <a className="back-link" href="/">← Evolution 360</a>
      <ClientWizard />
    </main>
  );
}
