import { dobrar } from "./geo";
import type { LocalNormalizado, ProjetoCiclo } from "./types";
import { avaliavel } from "./agregar";
import { NOME_UF, ufDe, UFS } from "./uf";

export { NOME_UF, UF_POR_CODIGO, UFS, ufDe } from "./uf";

/**
 * Parcerias proativas (Fase 11) — regras PURAS, sem `fs`/`pg`: o cliente
 * reagrega com os filtros globais, como o resto do painel.
 *
 * Duas perguntas do diretor:
 *  - MUNDO: onde as agências parceiras (APMT, JMM) têm missionário e NÃO chegou
 *    pedido nesta remessa? É lá que a Hebron pode tomar a iniciativa.
 *  - BRASIL: qual UF ficou sem projeto, e quem da JMN/IPB está lá — de
 *    preferência na cidade que mais compra produtos da Hebron (retribuição).
 */

export type Agencia = "APMT" | "JMM" | "JMN-IPB";

export interface Missionario {
  agencia: Agencia;
  nome: string;
  local: LocalNormalizado;
  /** Região das agências ("Área 14 - Sahel Africano"): conta, não pinta. */
  regiao: string | null;
  /** APMT: "Indígena", "Quilombola"… (o campo no Brasil). */
  publico: string | null;
  /** JMN-IPB: tipo de obreiro, município e UF como vieram. */
  tipo: string | null;
  municipio: string | null;
  uf: string | null;
  /** Código IBGE do município casado; null quando não achou. */
  codigoIbge: string | null;
  /** APMT: quanto o projeto dele recebeu na remessa 2026 — 0/null = não foi parceiro. */
  recebido2026: number | null;
  /** Chave estável para o CSV de candidatos. */
  chave: string;
}

export interface Municipio {
  codigo: string;
  nome: string;
  uf: string;
  lat: number;
  lon: number;
  /** Posição no ranking de demanda por produtos Hebron (1 = mais compra); null = fora. */
  demanda: number | null;
}

export interface Candidato {
  chave: string;
  /** Nome do missionário + local, para quem abre o CSV no Excel. */
  rotulo: string;
  nota: string;
  marcadoEm: string;
}

/** Top-N do ranking de demanda que vale "alta demanda" (decisão da equipe). */
export const ALTA_DEMANDA = 100;

// ----------------------------------------------------- casar município

/** "SAO JOSE DOS CAMPOS" e "São José dos Campos" viram a mesma chave. */
export function chaveMunicipio(nome: string, uf: string): string {
  return `${uf}:${dobrar(nome)
    .replace(/[^a-z0-9]+/g, " ")
    .trim()}`;
}

export function indexarMunicipios(
  municipios: Municipio[],
): Map<string, Municipio> {
  return new Map(municipios.map((m) => [chaveMunicipio(m.nome, m.uf), m]));
}

// ------------------------------------------------------------- mundo

export type Situacao = "atendido" | "oportunidade" | "retomar";

export interface PaisParceria {
  /** ISO-3, ou o nome da região quando sensível (chave da linha). */
  chave: string;
  iso3: string | null;
  nome: string;
  continente: string;
  sensivel: boolean;
  missionarios: number;
  porAgencia: Partial<Record<Agencia, number>>;
  /** Missionários da APMT cujo projeto já recebeu em 2026. */
  parceiros2026: number;
  /** Projetos avaliáveis desta remessa (o país "já foi atingido"). */
  projetos: number;
  /** Projetos aprovados na remessa anterior. */
  aprovadosAnterior: number;
  candidatos: number;
  situacao: Situacao;
}

export interface ResumoMundo {
  paises: PaisParceria[];
  /** Países (com ISO) onde alguma agência tem missionário. */
  comAgencia: number;
  oportunidades: number;
  retomar: number;
  /** Missionários nos países de oportunidade/retomada. */
  missionariosDisponiveis: number;
  candidatos: number;
}

const contar = <T>(itens: T[], chave: (t: T) => string | null) => {
  const m = new Map<string, number>();
  for (const i of itens) {
    const k = chave(i);
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
};

const chaveLocal = (l: LocalNormalizado, regiao: string | null) =>
  l.iso3 ?? regiao ?? (l.nomePt || null);

export function montarMundo(
  projetos: ProjetoCiclo[],
  anteriores: ProjetoCiclo[],
  missionarios: Missionario[],
  candidatos: Candidato[],
): ResumoMundo {
  const marcados = new Set(candidatos.map((c) => c.chave));
  const pedidos = contar(
    projetos.filter((p) => avaliavel(p.status)),
    (p) => p.local.iso3,
  );
  const aprovados = contar(
    anteriores.filter((p) => p.statusGrupo === "aprovado"),
    (p) => p.local.iso3,
  );

  const porChave = new Map<string, PaisParceria>();
  for (const m of missionarios) {
    if (m.agencia === "JMN-IPB") continue; // só Brasil; é a outra aba
    const chave = chaveLocal(m.local, m.regiao);
    if (!chave) continue;
    let pais = porChave.get(chave);
    if (!pais) {
      const iso3 = m.local.iso3;
      pais = {
        chave,
        iso3,
        nome: iso3 ? m.local.nomePt : (m.regiao ?? m.local.nomePt),
        continente: m.local.continente,
        sensivel: !iso3,
        missionarios: 0,
        porAgencia: {},
        parceiros2026: 0,
        projetos: iso3 ? (pedidos.get(iso3) ?? 0) : 0,
        aprovadosAnterior: iso3 ? (aprovados.get(iso3) ?? 0) : 0,
        candidatos: 0,
        situacao: "atendido",
      };
      porChave.set(chave, pais);
    }
    pais.missionarios++;
    pais.porAgencia[m.agencia] = (pais.porAgencia[m.agencia] ?? 0) + 1;
    if ((m.recebido2026 ?? 0) > 0) pais.parceiros2026++;
    if (marcados.has(m.chave)) pais.candidatos++;
  }

  for (const p of porChave.values()) {
    if (p.iso3 === "BRA" || p.projetos > 0) p.situacao = "atendido";
    else if (p.aprovadosAnterior > 0) p.situacao = "retomar";
    else p.situacao = "oportunidade";
  }

  const peso: Record<Situacao, number> = {
    retomar: 0,
    oportunidade: 1,
    atendido: 2,
  };
  const paises = [...porChave.values()].sort(
    (a, b) =>
      peso[a.situacao] - peso[b.situacao] ||
      Object.keys(b.porAgencia).length - Object.keys(a.porAgencia).length ||
      b.missionarios - a.missionarios ||
      a.nome.localeCompare(b.nome, "pt-BR"),
  );
  const abertos = paises.filter((p) => p.situacao !== "atendido");
  return {
    paises,
    comAgencia: paises.filter((p) => p.iso3).length,
    oportunidades: abertos.filter((p) => p.situacao === "oportunidade").length,
    retomar: abertos.filter((p) => p.situacao === "retomar").length,
    missionariosDisponiveis: abertos.reduce((s, p) => s + p.missionarios, 0),
    candidatos: paises.reduce((s, p) => s + p.candidatos, 0),
  };
}

// ------------------------------------------------------------ brasil

export interface UfParceria {
  uf: string;
  nome: string;
  /** Projetos avaliáveis desta remessa na UF. */
  projetos: number;
  missionarios: number;
  /** Missionários em cidade do top-N de demanda. */
  emAltaDemanda: number;
  /** O missionário na cidade de maior demanda da UF (null = nenhum casado). */
  melhor: { missionario: Missionario; municipio: Municipio } | null;
  candidatos: number;
  coberta: boolean;
}

export interface PontoCidade {
  municipio: Municipio;
  missionarios: Missionario[];
}

export interface ResumoBrasil {
  ufs: UfParceria[];
  pontos: PontoCidade[];
  cobertas: number;
  descobertas: number;
  descobertasComMissionario: number;
  /** Cidades do top-N de demanda onde há missionário. */
  cidadesAltaDemanda: number;
  candidatos: number;
  /** Projetos do Brasil sem UF reconhecível — ficam fora do mapa, mas contam. */
  semUf: number;
}

export function montarBrasil(
  projetos: ProjetoCiclo[],
  missionarios: Missionario[],
  municipios: Municipio[],
  candidatos: Candidato[],
): ResumoBrasil {
  const marcados = new Set(candidatos.map((c) => c.chave));
  const porCodigo = new Map(municipios.map((m) => [m.codigo, m]));
  const brasil = projetos.filter(
    (p) => p.local.iso3 === "BRA" && avaliavel(p.status),
  );
  const porUf = contar(brasil, (p) => ufDe(p.estado));
  const semUf = brasil.filter((p) => !ufDe(p.estado)).length;

  const pontosPorCodigo = new Map<string, PontoCidade>();
  const ufs = new Map<string, UfParceria>(
    UFS.map((uf) => [
      uf,
      {
        uf,
        nome: NOME_UF[uf]!,
        projetos: porUf.get(uf) ?? 0,
        missionarios: 0,
        emAltaDemanda: 0,
        melhor: null,
        candidatos: 0,
        coberta: (porUf.get(uf) ?? 0) > 0,
      },
    ]),
  );

  for (const m of missionarios) {
    if (m.agencia !== "JMN-IPB" || !m.uf) continue;
    const linha = ufs.get(m.uf);
    if (!linha) continue;
    linha.missionarios++;
    if (marcados.has(m.chave)) linha.candidatos++;
    const municipio = m.codigoIbge ? porCodigo.get(m.codigoIbge) : undefined;
    if (!municipio) continue;
    const demanda = municipio.demanda;
    if (demanda !== null && demanda <= ALTA_DEMANDA) linha.emAltaDemanda++;
    if (
      !linha.melhor ||
      (demanda ?? Infinity) < (linha.melhor.municipio.demanda ?? Infinity)
    )
      linha.melhor = { missionario: m, municipio };
    let ponto = pontosPorCodigo.get(municipio.codigo);
    if (!ponto) {
      ponto = { municipio, missionarios: [] };
      pontosPorCodigo.set(municipio.codigo, ponto);
    }
    ponto.missionarios.push(m);
  }

  // Descobertas primeiro; entre elas, quem tem gente em cidade de alta demanda.
  const lista = [...ufs.values()].sort(
    (a, b) =>
      Number(a.coberta) - Number(b.coberta) ||
      b.emAltaDemanda - a.emAltaDemanda ||
      b.missionarios - a.missionarios ||
      a.nome.localeCompare(b.nome, "pt-BR"),
  );
  const descobertas = lista.filter((u) => !u.coberta);
  const pontos = [...pontosPorCodigo.values()];
  return {
    ufs: lista,
    pontos,
    cobertas: lista.length - descobertas.length,
    descobertas: descobertas.length,
    descobertasComMissionario: descobertas.filter((u) => u.missionarios > 0)
      .length,
    cidadesAltaDemanda: pontos.filter(
      (p) =>
        p.municipio.demanda !== null && p.municipio.demanda <= ALTA_DEMANDA,
    ).length,
    candidatos: lista.reduce((s, u) => s + u.candidatos, 0),
    semUf,
  };
}
