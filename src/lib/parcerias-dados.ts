import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import {
  carregarCountryMap,
  DATA_DIR,
  lerCsv,
  lerCsvOpcional,
} from "./enrichment";
import { construirIndicePaises, dobrar, normalizarLocal } from "./geo";
import {
  chaveMunicipio,
  indexarMunicipios,
  ufDe,
  type Agencia,
  type Candidato,
  type Missionario,
  type Municipio,
} from "./parcerias";
import type { LocalNormalizado } from "./types";

/**
 * Leitura dos dados de parceria (Fase 11) — tudo em data/*.csv, FORA da origem:
 *  - db-apmt.csv, db-jmm.csv, db-jmn-ipb.csv, db-pioneiros.csv: relação de
 *    missionários que as agências mandaram (formatos diferentes, um leitor por
 *    arquivo);
 *  - ranking-dd.csv: cidades por demanda de produtos Hebron (1 = mais compra);
 *  - municipios-br.csv: centróide de cada município (gerado por
 *    `npm run municipios:regen` a partir do IBGE);
 *  - parcerias_candidatos.csv: o que o diretor marcou — a única escrita daqui.
 */

const APMT_CSV = resolve(DATA_DIR, "db-apmt.csv");
const JMM_CSV = resolve(DATA_DIR, "db-jmm.csv");
const JMN_CSV = resolve(DATA_DIR, "db-jmn-ipb.csv");
const PIONEIROS_CSV = resolve(DATA_DIR, "db-pioneiros.csv");
const RANKING_CSV = resolve(DATA_DIR, "ranking-dd.csv");
const MUNICIPIOS_CSV = resolve(DATA_DIR, "municipios-br.csv");
export const CANDIDATOS_CSV = resolve(DATA_DIR, "parcerias_candidatos.csv");

/** Campos das agências que são região, não país: contam, não pintam. */
const REGIAO = /^(área|area)\s*\d+|^asia$|^oriente médio$|^curdistão$/i;

export interface DadosParcerias {
  missionarios: Missionario[];
  municipios: Municipio[];
  candidatos: Candidato[];
  /** Para o `npm run check`: o que não casou. */
  pendencias: { paisesSemDePara: string[]; municipiosSemCasar: string[] };
}

/** "GUIMARÃES;FÁBIO" vem em caixa alta; o resto do painel mostra nome normal. */
function capitalizar(nome: string): string {
  return nome
    .toLocaleLowerCase("pt-BR")
    .replace(/\p{L}+/gu, (p) => p[0]!.toLocaleUpperCase("pt-BR") + p.slice(1))
    .replace(/\s+/g, " ")
    .trim();
}

function chave(agencia: Agencia, nome: string): string {
  return `${agencia}:${dobrar(nome).replace(/\s+/g, " ")}`;
}

export function carregarMunicipios(): Municipio[] {
  const ranking = new Map<string, number>();
  for (const r of parse(readFileSync(RANKING_CSV, "utf-8"), {
    columns: true,
    bom: true,
    delimiter: ";",
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[]) {
    const uf = ufDe(r["ESTADO"]);
    const posicao = Number(r["RNK"]);
    if (uf && r["CIDADE"] && Number.isFinite(posicao))
      ranking.set(chaveMunicipio(r["CIDADE"], uf), posicao);
  }
  return lerCsv(MUNICIPIOS_CSV).map((r) => ({
    codigo: r["codigo"] ?? "",
    nome: r["nome"] ?? "",
    uf: r["uf"] ?? "",
    lat: Number(r["lat"]),
    lon: Number(r["lon"]),
    demanda:
      ranking.get(chaveMunicipio(r["nome"] ?? "", r["uf"] ?? "")) ?? null,
  }));
}

export function carregarCandidatos(): Candidato[] {
  return lerCsvOpcional(CANDIDATOS_CSV)
    .map((r) => ({
      chave: r["chave"] ?? "",
      rotulo: r["rotulo"] ?? "",
      nota: r["nota"] ?? "",
      marcadoEm: r["marcado_em"] ?? "",
    }))
    .filter((c) => c.chave);
}

/** Marca (ou desmarca, se já estava) um missionário como candidato a parceria. */
export function alternarCandidato(alvo: {
  chave: string;
  rotulo: string;
  nota: string;
}): boolean {
  const atuais = carregarCandidatos();
  const ja = atuais.some((c) => c.chave === alvo.chave);
  const linhas = (
    ja
      ? atuais.filter((c) => c.chave !== alvo.chave)
      : [
          ...atuais,
          {
            chave: alvo.chave,
            rotulo: alvo.rotulo,
            nota: alvo.nota,
            marcadoEm: new Date().toISOString().slice(0, 10),
          },
        ]
  ).map((c) => ({
    chave: c.chave,
    rotulo: c.rotulo,
    nota: c.nota,
    marcado_em: c.marcadoEm,
  }));
  // BOM + CRLF como os outros CSVs de data/: a equipe abre e corrige no Excel.
  writeFileSync(
    CANDIDATOS_CSV,
    "﻿" +
      stringify(linhas, {
        header: true,
        columns: ["chave", "rotulo", "nota", "marcado_em"],
        record_delimiter: "windows",
      }),
    "utf-8",
  );
  return !ja;
}

export function carregarParcerias(): DadosParcerias {
  const indice = construirIndicePaises(carregarCountryMap());
  const municipios = carregarMunicipios();
  const porChave = indexarMunicipios(municipios);
  const paisesSemDePara = new Set<string>();
  const municipiosSemCasar = new Set<string>();

  const local = (
    bruto: string,
  ): {
    local: LocalNormalizado;
    regiao: string | null;
    publico: string | null;
  } => {
    const t = bruto.trim();
    if (REGIAO.test(t)) {
      return {
        local: normalizarLocal({ country: "Outro" }, indice),
        regiao: t,
        publico: null,
      };
    }
    // APMT: "Brasil Indígena", "Brasil - Afegãos" → Brasil, com o público.
    const m = /^brasil\s*-?\s*(.+)$/i.exec(t);
    const pais = m ? "Brasil" : t;
    const l = normalizarLocal({ country: pais || null }, indice);
    if (pais && !l.iso3 && !l.sensivel) paisesSemDePara.add(pais);
    return { local: l, regiao: null, publico: m ? m[1]!.trim() : null };
  };

  const missionarios: Missionario[] = [];
  const base = (agencia: Agencia, nome: string): Missionario => ({
    agencia,
    nome,
    local: normalizarLocal({ country: null }, indice),
    regiao: null,
    publico: null,
    tipo: null,
    municipio: null,
    uf: null,
    codigoIbge: null,
    recebido2026: null,
    chave: chave(agencia, nome),
  });

  // APMT: sem cabeçalho — nome, cônjuge, país, recebido em 2026 (0 = não foi parceiro).
  for (const r of parse(readFileSync(APMT_CSV, "utf-8"), {
    bom: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as string[][]) {
    const [nome, conjuge, pais, valor] = r;
    if (!nome) continue;
    const recebido = Number(
      (valor ?? "0").replace(/\./g, "").replace(",", "."),
    );
    missionarios.push({
      ...base("APMT", conjuge ? `${nome} e ${conjuge}` : nome),
      ...local(pais ?? ""),
      recebido2026: Number.isFinite(recebido) && recebido > 0 ? recebido : null,
    });
  }

  for (const r of lerCsv(JMM_CSV)) {
    const nome = r["NOME"];
    if (!nome) continue;
    missionarios.push({
      ...base("JMM", nome),
      ...local(r["CAMPO_PAIS"] ?? ""),
    });
  }

  for (const r of lerCsv(JMN_CSV)) {
    const nome = r["Missionário"];
    if (!nome) continue;
    const uf = ufDe(r["Estado"]);
    const municipio =
      r["Município"] && r["Município"] !== "-" ? r["Município"] : null;
    // "Araçagy, São José de Ribamar" é bairro + município; no DF tudo é Brasília.
    const tentativas = [
      municipio ?? "",
      municipio?.split(",").pop() ?? "",
      uf === "DF" ? "Brasília" : "",
    ].filter(Boolean);
    const casado =
      uf && municipio
        ? tentativas
            .map((t) => porChave.get(chaveMunicipio(t, uf)))
            .find(Boolean)
        : null;
    if (uf && municipio && !casado)
      municipiosSemCasar.add(`${municipio}/${uf}`);
    missionarios.push({
      ...base("JMN-IPB", nome),
      ...local("Brasil"),
      tipo: r["Tipo"] || null,
      municipio,
      uf,
      codigoIbge: casado?.codigo ?? null,
    });
  }

  // Pioneiros: uma linha por pessoa da família — só os adultos são missionários
  // (as outras são filhos). Nome vem em CAIXA ALTA, sobrenome primeiro.
  for (const r of parse(readFileSync(PIONEIROS_CSV, "utf-8"), {
    columns: true,
    bom: true,
    delimiter: ";",
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as Record<string, string>[]) {
    if (!/^x$/i.test(r["Adult"] ?? "")) continue;
    const nome = capitalizar(`${r["First names"] ?? ""} ${r["Surname"] ?? ""}`);
    if (!nome) continue;
    missionarios.push({
      ...base("Pioneiros", nome),
      ...local(r["Serving in"] ?? ""),
    });
  }

  return {
    missionarios,
    municipios,
    candidatos: carregarCandidatos(),
    pendencias: {
      paisesSemDePara: [...paisesSemDePara].sort(),
      municipiosSemCasar: [...municipiosSemCasar].sort(),
    },
  };
}
