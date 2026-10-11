import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { I18nProvider } from "@/lib/i18n";

// Geist e Geist Mono: fontes de toda a interface (tokens em globals.css).
const geist = Geist({ subsets: ["latin"], weight: ["300", "400", "500", "600"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: "AgroFlux — Passaporte digital de recebíveis",
  description: "Demonstração: recebíveis agrícolas fictícios com registro, aceite e cessão verificáveis na Solana Devnet.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${geist.variable} ${geistMono.variable}`}>
      <body>
        <I18nProvider>
          <AppShell>{children}</AppShell>
        </I18nProvider>
      </body>
    </html>
  );
}
