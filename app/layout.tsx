import type { Metadata } from "next";
import { Parkinsans, Titillium_Web } from "next/font/google";
import "./globals.css";

const titulo = Parkinsans({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--fonte-titulo",
});

const corpo = Titillium_Web({
  subsets: ["latin"],
  weight: ["300", "400", "600", "700"],
  variable: "--fonte-corpo",
});

export const metadata: Metadata = {
  title: "Painel Consultivo — Hebron ASEEC",
  description: "Planejamento das remessas missionárias da Hebron ASEEC.",
  icons: { icon: "/simbolo.png" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className={`${titulo.variable} ${corpo.variable}`}>
      <body>{children}</body>
    </html>
  );
}
