import type {
  Ano,
  CoberturaPrestacao,
  DocumentosInstituicao,
  EstatisticaNota,
  InstituicaoResumo,
  ProjetoCiclo,
  ProjetoLocal,
  RelatorioPrestacao,
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

/**
 * Cada eixo é multi-seleção e **inclusivo**: os valores marcados dentro de um
 * eixo se somam (OU), e os eixos se cruzam entre si (E). Lista vazia = sem
 * recorte naquele eixo.
 */
export interface Filtros {
  continente: string[];
  status: string[];
  categoria: string[];
  /** "true" | "false" — vazio = todas. */
  conveniada: string[];
  iso3: string | null;
  /** novo · renovacao · revisar (Fase 5). */
  tipo: string[];
  /** Nome do diretor/conselheiro dono da pasta; "__sem" = sem responsável. */
  responsavel: string[];
}

export const SEM_FILTRO: Filtros = {
  continente: [],
  status: [],
  categoria: [],
  conveniada: [],
  iso3: null,
  tipo: [],
  responsavel: [],
};

/** Chave de agrupamento por responsável — projeto sem dono tem uma cesta só. */
export const SEM_RESPONSAVEL = "__sem";

/** Liga/desliga um valor num eixo — é o clique nas barras e nos checkboxes. */
export function alternar(selecionados: string[], valor: string): string[] {
  return selecionados.includes(valor)
    ? selecionados.filter((v) => v !== valor)
    : [...selecionados, valor];
}

const casa = (selecionados: string[], valor: string): boolean =>
  selecionados.length === 0 || selecionados.includes(valor);

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
      casa(f.continente, p.local.continente) &&
      casa(f.status, p.statusGrupo) &&
      casa(f.categoria, p.categoria) &&
      casa(f.conveniada, String(ehConveniada(p))) &&
      casa(f.tipo, p.revisao.tipo) &&
      casa(f.responsavel, p.revisao.responsavel ?? SEM_RESPONSAVEL) &&
      (f.iso3 === null || p.local.iso3 === f.iso3),
  );
}

export function temFiltro(f: Filtros): boolean {
  return (
    f.continente.length > 0 ||
    f.status.length > 0 ||
    f.categoria.length > 0 ||
    f.conveniada.length > 0 ||
    f.tipo.length > 0 ||
    f.responsavel.length > 0 ||
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

// --------------------------------------------------- instituições (Fase 4)

const SEM_DOCUMENTOS: DocumentosInstituicao = {
  enviados: 0,
  pendentes: 0,
  total: 0,
};

/**
 * Agrega por instituição — o ranking de verba da página 05.
 *
 * `documentos` vem do servidor (`dados.conformidade()`): não depende do ciclo
 * nem dos filtros, então é só um lookup por uuid, não uma reagregação.
 */
export function agregarPorInstituicao(
  projetos: ProjetoCiclo[],
  documentos: Record<string, DocumentosInstituicao> = {},
): InstituicaoResumo[] {
  const mapa = agrupar(projetos, (p) => p.instituicaoId ?? "__sem");

  return [...mapa.entries()]
    .map(([id, lista]) => {
      const primeiro = lista[0]!;
      const soma = (f: (p: ProjetoCiclo) => number | null) =>
        lista.reduce((s, p) => s + (f(p) ?? 0), 0);

      return {
        id,
        nome: primeiro.instituicaoNome ?? "(sem instituição)",
        // Mesma regra do resto do painel: is_conveniada nulo NÃO é conveniada.
        conveniada: lista.some(ehConveniada),
        projetos: lista.length,
        solicitado: soma((p) => p.solicitado),
        aprovado: soma((p) => p.aprovado),
        reservado: soma((p) => p.reservado),
        paises: new Set(lista.map((p) => p.local.iso3 ?? p.local.nomePt)).size,
        notaMediana: estatisticaNota(
          lista
            .map((p) => p.notaMediana)
            .filter((v): v is number => v !== null),
        ).mediana,
        situacao: primeiro.enriquecimento.situacaoNoSistema,
        anosDeParceria: primeiro.enriquecimento.anosDeParceria,
        valorAprovado2025: primeiro.enriquecimento.valorAprovado2025,
        documentos: documentos[id] ?? SEM_DOCUMENTOS,
      };
    })
    .sort((a, b) => b.aprovado - a.aprovado || b.solicitado - a.solicitado);
}

// ---------------------------------------------- pastas da reunião (Fase 5)

/**
 * Status que tiram o projeto da avaliação: não há o que avaliar, e cada vaga de
 * pasta é tempo de leitura de alguém.
 *
 * `rascunho` sai porque foi escrito e **nunca submetido** — não é candidatura.
 * `devolvido-para-correcao` FICA: foi submetido e ainda pode voltar corrigido.
 */
const FORA_DA_AVALIACAO = new Set([
  "rejeitado",
  "reprovado",
  "rascunho",
  "cancelado",
]);

/**
 * O projeto entra na avaliação da reunião? Regra de STATUS, separada da triagem
 * de propósito — o script de distribuição só tem o status em mãos.
 */
export const avaliavel = (status: string): boolean =>
  !FORA_DA_AVALIACAO.has(status);

const ehNovo = (p: ProjetoCiclo): boolean => p.revisao.tipo !== "renovacao";

/** Quem entra na pasta de um diretor/conselheiro: novo (ou a revisar) e não rejeitado. */
export const vaiParaPasta = (p: ProjetoCiclo): boolean =>
  ehNovo(p) && avaliavel(p.status);

/** Uma pasta: os projetos novos que um diretor/conselheiro vai apresentar. */
export interface Pasta {
  responsavel: string;
  /** Falso só na cesta dos projetos ainda sem dono. */
  atribuida: boolean;
  projetos: ProjetoCiclo[];
  solicitado: number;
  /** Quantos ainda estão como "revisar" — vínculo não decidido. */
  aRevisar: number;
}

/**
 * Agrupa os projetos novos por dono da pasta. Avaliador sem nenhum projeto
 * continua na lista (com zero): na reunião, "o Fulano não tem pasta" é
 * informação, e uma linha que some parece bug.
 *
 * Rejeitado fica de fora mesmo que o CSV ainda tenha um responsável na linha —
 * a pasta mostra o que a pessoa vai apresentar, não o histórico da atribuição.
 */
export function montarPastas(
  projetos: ProjetoCiclo[],
  avaliadores: string[] = [],
): Pasta[] {
  const novos = projetos.filter(vaiParaPasta);
  const porDono = agrupar(
    novos,
    (p) => p.revisao.responsavel ?? SEM_RESPONSAVEL,
  );
  const nomes = [...new Set([...avaliadores, ...porDono.keys()])];

  return (
    nomes
      .map((responsavel) => {
        const lista = porDono.get(responsavel) ?? [];
        return {
          responsavel,
          atribuida: responsavel !== SEM_RESPONSAVEL,
          projetos: lista.sort((a, b) =>
            a.titulo.localeCompare(b.titulo, "pt-BR"),
          ),
          solicitado: lista.reduce((s, p) => s + p.solicitado, 0),
          aRevisar: lista.filter((p) => p.revisao.tipo === "revisar").length,
        };
      })
      // Sem dono por último: é a fila de trabalho, não uma pasta de apresentação.
      .sort(
        (a, b) =>
          Number(b.atribuida) - Number(a.atribuida) ||
          a.responsavel.localeCompare(b.responsavel, "pt-BR"),
      )
  );
}

// ---------------------------------------- prestação de contas (Fase 4)

/** Quem deve prestar contas: projeto que recebeu verba. */
export const ehFinanciado = (p: ProjetoCiclo): boolean =>
  p.statusGrupo === "aprovado" || p.statusGrupo === "encerrado";

/**
 * Cobertura da prestação de contas do ciclo, sob o recorte atual.
 *
 * A remessa de um relatório vem do PROJETO, não do `cycle_id` do relatório: na
 * origem há relatórios carimbados com o ciclo 2026 que prestam contas de
 * projetos aprovados na Remessa 2025 (o ciclo aberto na hora do envio). Casar
 * pelo projeto também restringe os relatórios ao recorte — senão a contagem de
 * relatórios contradiria a de projetos assim que um filtro fosse aplicado.
 */
export function montarCobertura(
  projetos: ProjetoCiclo[],
  relatorios: RelatorioPrestacao[],
  ano: Ano,
): CoberturaPrestacao {
  const noRecorte = new Map(projetos.map((p) => [p.id, p]));
  const doCiclo = relatorios.filter((r) => noRecorte.has(r.projetoId));

  const financiados = projetos.filter(ehFinanciado);
  const comRelatorio = new Set(
    doCiclo
      .map((r) => r.projetoId)
      .filter((id) => ehFinanciado(noRecorte.get(id)!)),
  );

  const aprovadoDe = (ps: ProjetoCiclo[]) =>
    ps.reduce((s, p) => s + (p.aprovado ?? 0), 0);
  const cobertos = financiados.filter((p) => comRelatorio.has(p.id));
  const pendentes = financiados
    .filter((p) => !comRelatorio.has(p.id))
    .sort((a, b) => (b.aprovado ?? 0) - (a.aprovado ?? 0));

  const porTrimestre = [
    ...agrupar(doCiclo, (r) => `${r.ano}-${r.trimestre}`).entries(),
  ]
    .map(([chave, lista]) => ({
      rotulo: `T${chave.split("-")[1]}/${chave.split("-")[0]}`,
      relatorios: lista.length,
      enviados: lista.filter((r) => r.status !== "rascunho").length,
      projetos: new Set(lista.map((r) => r.projetoId)).size,
    }))
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo));

  return {
    ano,
    financiados: financiados.length,
    comRelatorio: comRelatorio.size,
    cobertura: financiados.length ? comRelatorio.size / financiados.length : 0,
    relatorios: doCiclo.length,
    enviados: doCiclo.filter((r) => r.status !== "rascunho").length,
    rascunhos: doCiclo.filter((r) => r.status === "rascunho").length,
    instituicoes: new Set(
      doCiclo.map((r) => r.instituicaoId).filter(Boolean) as string[],
    ).size,
    aprovadoTotal: aprovadoDe(financiados),
    aprovadoCoberto: aprovadoDe(cobertos),
    aprovadoDescoberto: aprovadoDe(pendentes),
    relatoriosForaDoEsperado: doCiclo.filter(
      (r) => !ehFinanciado(noRecorte.get(r.projetoId)!),
    ).length,
    relatoriosDeOutroCiclo: doCiclo.filter((r) => r.cicloAno !== ano).length,
    porTrimestre,
    pendentes,
  };
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
