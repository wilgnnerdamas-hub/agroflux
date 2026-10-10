import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { I18nProvider } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "AgroFlux — Passaporte digital de recebíveis",
  description: "Demonstração: recebíveis agrícolas fictícios com registro, aceite e cessão verificáveis na Solana Devnet.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        <I18nProvider>
          <AppShell>{children}</AppShell>
        </I18nProvider>
      </body>
    </html>
  );
}
