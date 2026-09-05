import type { NextConfig } from "next";

const config: NextConfig = {
  // O driver do Postgres não deve ser empacotado — roda como módulo Node no servidor.
  serverExternalPackages: ["pg"],
};

export default config;
