import type { NextConfig } from "next";

/*
 * O que a página carrega de fora: fontes do Google (só a janela de impressão
 * da relação de projetos), anexos/vídeos dos buckets públicos do Supabase e o
 * visor do Drive. Mais nada. `'unsafe-inline'` em script fica porque a janela
 * de impressão (projetos/exportar.tsx) escreve o próprio <script>.
 * ponytail: sem nonce; trocar por CSP com nonce no proxy.ts se o painel ganhar
 * superfície de XSS além do parecer já sanitizado (src/lib/html.ts).
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://*.supabase.co",
  "media-src 'self' https://*.supabase.co",
  "frame-src https://*.supabase.co https://drive.google.com https://docs.google.com",
  "connect-src 'self' https://*.supabase.co",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // Sem `upgrade-insecure-requests`: o `npm start` da máquina da reunião é
  // http://localhost e o navegador tentaria o CSS em https.
  "frame-ancestors 'none'",
].join("; ");

const config: NextConfig = {
  // O driver do Postgres não deve ser empacotado — roda como módulo Node no servidor.
  serverExternalPackages: ["pg"],
  // Os CSVs e o GeoJSON são lidos com `fs` em tempo de execução; na Vercel só
  // vai para a função o que o trace enxerga.
  outputFileTracingIncludes: { "/*": ["./data/**/*"] },
  poweredByHeader: false,
  async headers() {
    const seguranca = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=()",
      },
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
    ];
    // Em dev o Next precisa de eval e websocket; a CSP e o HSTS valem só no build.
    if (process.env.NODE_ENV === "production")
      seguranca.push(
        { key: "Content-Security-Policy", value: CSP },
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains",
        },
      );
    return [{ source: "/:path*", headers: seguranca }];
  },
};

export default config;
