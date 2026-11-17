import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "csv-parse/sync";
import { carregarCandidatos } from "./painel-db";
import { carregarCountryMap, DATA_DIR, lerCsv } from "./enrichment";
import { construirIndicePaises, dobrar, normalizarLocal } from "./geo";
import {
  chaveMunicipio,
  indexarMunicipios,
  ufDe,
  type Agencia,
  type Candidato,
  type Missionario,
  type Municipio,
  type Presenca,
} from "./parcerias";
import type { LocalNormalizado } from "./types";

/**
 * Leitura dos dados de parceria (Fase 11) — tudo em data/*.csv, FORA da origem:
 *  - db-apmt.csv, db-jmm.csv, db-jmn-ipb.csv, db-jmn-cbb.csv, db-pioneiros.csv:
 *    relação de missionários que as agências mandaram (formatos diferentes, um
 *    leitor por arquivo);
 *  - db-jmm-paises.csv: países onde a JMM atua, sem nomes (vira `Presenca`);
 *  - ranking-dd.csv: cidades por demanda de produtos Hebron (1 = mais compra);
 *  - municipios-br.csv: centróide de cada município (gerado por
 *    `npm run municipios:regen` a partir do IBGE);
 *  (o que o diretor marca como candidato vive no Firestore — painel-db.ts).
 */

const APMT_CSV = resolve(DATA_DIR, "db-apmt.csv");
const JMM_CSV = resolve(DATA_DIR, "db-jmm.csv");
const JMM_PAISES_CSV = resolve(DATA_DIR, "db-jmm-paises.csv");
const JMN_CSV = resolve(DATA_DIR, "db-jmn-ipb.csv");
const CBB_CSV = resolve(DATA_DIR, "db-jmn-cbb.csv");
const PIONEIROS_CSV = resolve(DATA_DIR, "db-pioneiros.csv");
const RANKING_CSV = resolve(DATA_DIR, "ranking-dd.csv");
const MUNICIPIOS_CSV = resolve(DATA_DIR, "municipios-br.csv");

/** Campos das agências que são região, não país: contam, não pintam. */
const REGIAO = /^(área|area)\s*\d+|^asia$|^oriente médio$|^curdistão$/i;

export interface DadosParcerias {
  missionarios: Missionario[];
  presencas: Presenca[];
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

export async function carregarParcerias(): Promise<DadosParcerias> {
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

  // Missões nacionais (IPB e CBB): município + UF, casados com o IBGE.
  const nacional = (
    agencia: Agencia,
    nome: string,
    tipo: string | undefined,
    cidade: string | undefined,
    estado: string | undefined,
  ): Missionario => {
    const uf = ufDe(estado);
    const municipio = cidade && cidade !== "-" ? cidade : null;
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
    return {
      ...base(agencia, nome),
      ...local("Brasil"),
      tipo: tipo || null,
      municipio,
      uf,
      codigoIbge: casado?.codigo ?? null,
    };
  };

  for (const r of lerCsv(JMN_CSV)) {
    const nome = r["Missionário"];
    if (!nome) continue;
    missionarios.push(
      nacional("JMN-IPB", nome, r["Tipo"], r["Município"], r["Estado"]),
    );
  }

  // CBB: veio em CP850 (convertido para UTF-8), `;`, 1ª linha é o título
  // ("Quadro de Obreiros… 09/2026"). O quadro traz também a equipe de apoio
  // (professor, cuidador, zelador…): só quem tem função "Miss…" é missionário.
  for (const r of parse(readFileSync(CBB_CSV, "utf-8"), {
    columns: true,
    bom: true,
    delimiter: ";",
    from_line: 2,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as Record<string, string>[]) {
    const nome = r["Nome"];
    if (!nome || !/^miss/i.test(r["Função"] ?? "")) continue;
    missionarios.push({
      ...nacional("JMN-CBB", nome, r["Função"], r["Cidade"], r["UF"]),
      publico: r["Projeto"] || null,
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

  const presencas: Presenca[] = lerCsv(JMM_PAISES_CSV).map((r) => ({
    agencia: "JMM",
    local: local(r["Países"] ?? "").local,
  }));

  return {
    missionarios,
    presencas,
    municipios,
    candidatos: await carregarCandidatos(),
    pendencias: {
      paisesSemDePara: [...paisesSemDePara].sort(),
      municipiosSemCasar: [...municipiosSemCasar].sort(),
    },
  };
}
