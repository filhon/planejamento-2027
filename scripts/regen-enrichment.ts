/**
 * Regenera as colunas DERIVADAS de data/institution_enrichment.csv a partir da
 * origem (só SELECT) — e **preserva intactas** as colunas curadas pela equipe
 * (`parceria_desde_ano`, `tipo_parceria`, `observacoes_avaliacao`).
 *
 *   npm run enrich:regen           → grava o CSV
 *   npm run enrich:regen -- --dry  → só mostra o que mudaria
 *
 * Nada é escrito no banco de origem. Ver docs/enriquecimento-dados.md.
 */
import { writeFileSync } from "node:fs";
import { stringify } from "csv-stringify/sync";
import { closePool } from "../src/lib/db";
import { fetchInstituicoesDerivadas } from "../src/lib/queries";
import {
  INSTITUTION_ENRICHMENT_CSV,
  carregarInstitutionEnrichment,
} from "../src/lib/enrichment";
import type { InstitutionEnrichmentRow } from "../src/lib/types";

const COLUNAS = [
  "institution_id",
  "institution_name",
  "is_conveniada",
  "projetos_2025",
  "projetos_2026",
  "aprovados_2025",
  "valor_aprovado_2025_derivado",
  "situacao_no_sistema_derivada",
  "parceria_desde_ano",
  "tipo_parceria",
  "observacoes_avaliacao",
] as const;

function curadoDe(atual: InstitutionEnrichmentRow | undefined) {
  return {
    parceria_desde_ano: atual?.parceriaDesdeAno ?? "",
    tipo_parceria: atual?.tipoParceria ?? "",
    observacoes_avaliacao: atual?.observacoesAvaliacao ?? "",
  };
}

async function main(): Promise<void> {
  const dry = process.argv.includes("--dry");
  const derivadas = await fetchInstituicoesDerivadas();

  let existentes: InstitutionEnrichmentRow[] = [];
  try {
    existentes = carregarInstitutionEnrichment(true);
  } catch {
    console.log("CSV ainda não existe — será criado do zero.");
  }
  const porId = new Map(existentes.map((e) => [e.institutionId, e]));

  const linhas = derivadas.map((d) => ({
    institution_id: d.institution_id,
    institution_name: d.institution_name,
    is_conveniada: d.is_conveniada ? "sim" : "não",
    projetos_2025: d.projetos_2025,
    projetos_2026: d.projetos_2026,
    aprovados_2025: d.aprovados_2025,
    valor_aprovado_2025_derivado: Number(d.valor_aprovado_2025 ?? 0).toFixed(2),
    situacao_no_sistema_derivada: d.situacao,
    ...curadoDe(porId.get(d.institution_id)),
  }));

  const novas = linhas.filter((l) => !porId.has(l.institution_id));
  const removidas = existentes.filter(
    (e) => !derivadas.some((d) => d.institution_id === e.institutionId),
  );
  const curadasPreservadas = linhas.filter(
    (l) =>
      l.parceria_desde_ano !== "" ||
      l.tipo_parceria !== "" ||
      l.observacoes_avaliacao !== "",
  ).length;

  console.log(`Instituições na origem: ${derivadas.length}`);
  console.log(`Linhas no CSV atual:    ${existentes.length}`);
  console.log(
    `Novas:                  ${novas.length}${novas.length ? " — " + novas.map((n) => n.institution_name).join(", ") : ""}`,
  );
  console.log(
    `Sumiram da origem:      ${removidas.length}${removidas.length ? " — " + removidas.map((r) => r.institutionName).join(", ") : ""}`,
  );
  console.log(
    `Curadoria preservada:   ${curadasPreservadas} linha(s) com dado curado`,
  );

  if (dry) {
    console.log("\n--dry: nada foi gravado.");
    await closePool();
    return;
  }

  // BOM + CRLF para o Excel no Windows abrir certo (é assim que o arquivo já está).
  const csv =
    "﻿" +
    stringify(linhas, {
      header: true,
      columns: [...COLUNAS],
      record_delimiter: "windows",
    });
  writeFileSync(INSTITUTION_ENRICHMENT_CSV, csv, "utf-8");
  console.log(`\nGravado: ${INSTITUTION_ENRICHMENT_CSV}`);
  await closePool();
}

main().catch(async (erro) => {
  console.error("Erro:", erro instanceof Error ? erro.message : erro);
  await closePool();
  process.exitCode = 1;
});
