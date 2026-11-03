import type { Metadata } from "next";
import { Titillium_Web } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

/*
 * O `fallback` é explícito porque a Parkinsans não está em
 * `capsize-font-metrics.json` — a tabela pré-calculada que o Next atualiza à
 * mão a cada fonte nova do Google. Sem as métricas ele não conseguia gerar a
 * "Parkinsans Fallback" ajustada e avisava no build a cada compilação, um
 * aviso permanente em que o próximo aviso de verdade se esconderia.
 *
 * Declarada a pilha de recuo, o Turbopack usa ESTA e não procura métrica
 * nenhuma. (`adjustFontFallback: false` não resolve: o carregador de fonte do
 * Turbopack é outro, em Rust, e ignora a opção — testado.)
 *
 * A Titillium tem métricas e segue no caminho automático, que é melhor: o
 * recuo dela vem com `size-adjust` e não mexe no layout ao trocar.
 */
const titulo = localFont({
  src: "./fonts/parkinsans.woff2", // variável 300–800, subconjunto latin (@fontsource-variable/parkinsans)
  weight: "300 800",
  variable: "--fonte-titulo",
  fallback: ["system-ui", "sans-serif"],
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
  robots: { index: false, follow: false },
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
