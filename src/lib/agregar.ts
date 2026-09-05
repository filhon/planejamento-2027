import type {
  Ano,
  EstatisticaNota,
  ProjetoCiclo,
  ProjetoLocal,
  ResumoCiclo,
  StatusGrupo,
} from "./types";

/**
 * Agregações PURAS dos datasets — sem `pg`, sem `fs`, sem I/O.
 *
 * Vive separado de `datasets.ts` de propósito: a UI aplica os filtros da reunião
 * no navegador (continente/status/categoria/país) e reagrega com estas mesmas
 * funções. Se elas morassem em `datasets.ts`, o import arrastaria o driver do
 * banco para o bundle do cliente. `datasets.ts` reexporta tudo daqui.
 */

// ------------------------------------------------------------------ status

const GRUPOS: Record<string, StatusGrupo> = {
  aprovado: "aprovado",
  "em-andamento": "aprovado",
  concluido: "encerrado",
  submetido: "em-avaliacao",
  "em-analise": "em-avaliacao",
  "em-validacao": "em-avaliacao",
  "para-votacao": "em-avaliacao",
  "em-votacao": "em-avaliacao",
  classificado: "classificado",
  rejeitado: "rejeitado",
  reprovado: "rejeitado",
  rascunho: "neutro",
  "devolvido-para-correcao": "neutro",
  cancelado: "neutro",
};

export function grupoDeStatus(status: string): StatusGrupo {
  return GRUPOS[status] ?? "neutro";
}

// ----------------------------------------------------------------- filtros

/** Valor do <select> "sem recorte" — não colide com nenhum dado real. */
export const TODOS = "__todos";

export interface Filtros {
  continente: string;
  status: string;
  categoria: string;
  /** "true" | "false" | TODOS. */
  conveniada: string;
  iso3: string | null;
}

export const SEM_FILTRO: Filtros = {
  continente: TODOS,
  status: TODOS,
  categoria: TODOS,
  conveniada: TODOS,
  iso3: null,
};

/**
 * `institutions.is_conveniada` é `boolean | null`, e projeto sem instituição
 * também chega como null. Para o orçamento, o que não é conveniada disputa o
 * teto das NÃO conveniadas — então null conta como não conveniada, aqui e na
 * página de Orçamento (uma regra só).
 */
export const ehConveniada = (p: ProjetoCiclo): boolean => p.conveniada === true;

/** Os filtros globais da reunião, aplicados de uma vez. */
export function filtrar(projetos: ProjetoCiclo[], f: Filtros): ProjetoCiclo[] {
  return projetos.filter(
    (p) =>
      (f.continente === TODOS || p.local.continente === f.continente) &&
      (f.status === TODOS || p.statusGrupo === f.status) &&
      (f.categoria === TODOS || p.categoria === f.categoria) &&
      (f.conveniada === TODOS || String(ehConveniada(p)) === f.conveniada) &&
      (f.iso3 === null || p.local.iso3 === f.iso3),
  );
}

export function temFiltro(f: Filtros): boolean {
  return (
    f.continente !== TODOS ||
    f.status !== TODOS ||
    f.categoria !== TODOS ||
    f.conveniada !== TODOS ||
    f.iso3 !== null
  );
}

// ------------------------------------------------------------------- util

export function agrupar<T>(
  itens: T[],
  chave: (i: T) => string,
): Map<string, T[]> {
  const mapa = new Map<string, T[]>();
  for (const item of itens) {
    const k = chave(item);
    const lista = mapa.get(k);
    if (lista) lista.push(item);
    else mapa.set(k, [item]);
  }
  return mapa;
}

// ------------------------------------------------------------ estatísticas

function quantil(ordenados: number[], q: number): number | null {
  if (ordenados.length === 0) return null;
  const pos = (ordenados.length - 1) * q;
  const base = Math.floor(pos);
  const resto = pos - base;
  const atual = ordenados[base]!;
  const proximo = ordenados[base + 1];
  return proximo === undefined ? atual : atual + resto * (proximo - atual);
}

/** Média + mediana + dispersão. As notas são infladas (984/1742 = 10,0 em 2025). */
export function estatisticaNota(valores: number[]): EstatisticaNota {
  const notas = valores.filter((v) => Number.isFinite(v));
  const n = notas.length;
  if (n === 0) {
    return {
      n: 0,
      media: null,
      mediana: null,
      p25: null,
      p75: null,
      desvio: null,
      min: null,
      max: null,
      fracaoNotaMaxima: null,
    };
  }
  const ordenados = [...notas].sort((a, b) => a - b);
  const media = notas.reduce((s, v) => s + v, 0) / n;
  const variancia =
    n > 1 ? notas.reduce((s, v) => s + (v - media) ** 2, 0) / (n - 1) : 0;
  return {
    n,
    media,
    mediana: quantil(ordenados, 0.5),
    p25: quantil(ordenados, 0.25),
    p75: quantil(ordenados, 0.75),
    desvio: Math.sqrt(variancia),
    min: ordenados[0]!,
    max: ordenados[n - 1]!,
    fracaoNotaMaxima: notas.filter((v) => v >= 10).length / n,
  };
}

// ---------------------------------------------------------- projeto_local

/** Agrega por país — é o insumo direto do choropleth e do ranking "Top países". */
export function agregarPorPais(projetos: ProjetoCiclo[]): ProjetoLocal[] {
  const mapa = new Map<
    string,
    ProjetoLocal & {
      _categorias: Map<string, number>;
      _instituicoes: Set<string>;
    }
  >();

  for (const p of projetos) {
    const chave = p.local.iso3 ?? `__${p.local.nomePt}`;
    let atual = mapa.get(chave);
    if (!atual) {
      atual = {
        iso3: p.local.iso3,
        nomePt: p.local.nomePt,
        continente: p.local.continente,
        sensivel: p.local.sensivel,
        projetos: 0,
        solicitado: 0,
        aprovado: 0,
        instituicoes: 0,
        categorias: [],
        _categorias: new Map(),
        _instituicoes: new Set(),
      };
      mapa.set(chave, atual);
    }
    atual.projetos += 1;
    atual.solicitado += p.solicitado;
    atual.aprovado += p.aprovado ?? 0;
    atual._categorias.set(
      p.categoria,
      (atual._categorias.get(p.categoria) ?? 0) + 1,
    );
    if (p.instituicaoId) atual._instituicoes.add(p.instituicaoId);
  }

  return [...mapa.values()]
    .map(({ _categorias, _instituicoes, ...local }) => ({
      ...local,
      instituicoes: _instituicoes.size,
      categorias: [..._categorias.entries()]
        .map(([categoria, projetos]) => ({ categoria, projetos }))
        .sort((a, b) => b.projetos - a.projetos),
    }))
    .sort((a, b) => b.projetos - a.projetos);
}

// ----------------------------------------------------------- resumo (KPIs)

export function montarResumo(projetos: ProjetoCiclo[], ano: Ano): ResumoCiclo {
  const paises = new Set(
    projetos.map((p) => p.local.iso3).filter((v): v is string => v !== null),
  );
  const internacionais = projetos.filter(
    (p) => p.local.iso3 !== null && p.local.iso3 !== "BRA",
  );
  const instituicoes = new Set(
    projetos.map((p) => p.instituicaoId).filter(Boolean) as string[],
  );
  const conveniadas = new Set(
    projetos
      .filter((p) => p.conveniada)
      .map((p) => p.instituicaoId)
      .filter(Boolean) as string[],
  );

  const porStatus = [...agrupar(projetos, (p) => p.status).entries()]
    .map(([status, lista]) => ({
      status,
      projetos: lista.length,
      solicitado: lista.reduce((s, p) => s + p.solicitado, 0),
    }))
    .sort((a, b) => b.projetos - a.projetos);

  const porCategoria = [...agrupar(projetos, (p) => p.categoria).entries()]
    .map(([categoria, lista]) => ({
      categoria,
      projetos: lista.length,
      solicitado: lista.reduce((s, p) => s + p.solicitado, 0),
      aprovado: lista.reduce((s, p) => s + (p.aprovado ?? 0), 0),
    }))
    .sort((a, b) => b.solicitado - a.solicitado);

  const porContinente = [
    ...agrupar(projetos, (p) => p.local.continente).entries(),
  ]
    .map(([continente, lista]) => ({
      continente,
      projetos: lista.length,
      solicitado: lista.reduce((s, p) => s + p.solicitado, 0),
    }))
    .sort((a, b) => b.projetos - a.projetos);

  return {
    ano,
    projetos: projetos.length,
    paisesAlcancados: paises.size,
    projetosInternacionais: internacionais.length,
    fracaoInternacional: projetos.length
      ? internacionais.length / projetos.length
      : 0,
    projetosSensiveis: projetos.filter(
      (p) => p.areaSensivel || p.local.sensivel,
    ).length,
    solicitado: projetos.reduce((s, p) => s + p.solicitado, 0),
    aprovado: projetos.reduce((s, p) => s + (p.aprovado ?? 0), 0),
    instituicoes: instituicoes.size,
    instituicoesConveniadas: conveniadas.size,
    porStatus,
    porCategoria,
    porContinente,
  };
}
