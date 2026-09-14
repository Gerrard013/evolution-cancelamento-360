import type { Metadata } from "next";
import "./globals.css";
import "./immersive.css";
import ImmersiveShell from "@/components/ImmersiveShell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Evolution Cancelamento 360",
  description: "Canal oficial da Evolution Academia para cancelamentos, protocolos e acompanhamento digital."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        <ImmersiveShell>{children}</ImmersiveShell>
      </body>
    </html>
  );
}
