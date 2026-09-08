import type { TipoRevisao } from "./types";

/**
 * Casamento de projeto entre remessas — PURO, sem I/O.
 *
 * A origem não liga o projeto de uma remessa ao da anterior: `cycle_projects`
 * não tem `previous_project_id` nem nada equivalente, e a única continuidade
 * registrada é a da INSTITUIÇÃO. Só que instituição recorrente não quer dizer
 * projeto recorrente: das 226 submissões de 2026 vindas de instituição que já
 * submeteu em 2025, boa parte é projeto genuinamente novo, e parte é renovação
 * com o título reescrito ("Venha o Teu Reino" → "VENHA A TEU REINO").
 *
 * Por isso aqui é SUGESTÃO, não veredito: o casamento propõe, a equipe confirma
 * em data/projetos_avaliacao.csv. O que fica no meio vira "revisar" — e o painel
 * cobra essas pendências em vez de fingir que decidiu.
 *
 * Ver docs/fase5-projetos.md.
 */

const STOPWORDS = new Set(
  (
    "de da do das dos e o a os as em no na nos nas para por com um uma " +
    "ao aos à às pra pelo pela projeto"
  )
    .split(" ")
    .filter(Boolean),
);

/**
 * Título comparável: sem acento, sem pontuação, sem ano solto e sem palavra
 * vazia. O ano precisa sair porque "Boa Semente 2026" e "Boa Semente 2025" são
 * o mesmo projeto — é justamente a remessa que muda.
 */
export function normalizarTitulo(titulo: string): string {
  return titulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t && !STOPWORDS.has(t) && !/^20[2-3][0-9]$/.test(t))
    .join(" ");
}

/** Bigramas de caractere — pegam plural e troca de letra ("parceiro"/"parceiros"). */
function bigramas(texto: string): string[] {
  const s = texto.replace(/\s+/g, " ");
  if (s.length < 2) return s ? [s] : [];
  return Array.from({ length: s.length - 1 }, (_, i) => s.slice(i, i + 2));
}

/**
 * Coeficiente de Sørensen–Dice sobre bigramas (0 a 1).
 *
 * Dice em vez de Levenshtein porque o que muda entre remessas quase sempre é
 * acréscimo de palavra ("Curso de Introdução Bíblica" → "Projeto de
 * continuidade e expansão — Curso de Introdução Bíblica nas aldeias"), e
 * distância de edição pune acréscimo longo como se fosse título diferente.
 */
export function similaridadeTitulo(a: string, b: string): number {
  const x = normalizarTitulo(a);
  const y = normalizarTitulo(b);
  if (!x || !y) return 0;
  if (x === y) return 1;

  const ba = bigramas(x);
  const bb = bigramas(y);
  if (ba.length === 0 || bb.length === 0) return 0;

  // Interseção de MULTICONJUNTO: repetir um bigrama não pode contar duas vezes.
  const restantes = new Map<string, number>();
  for (const g of bb) restantes.set(g, (restantes.get(g) ?? 0) + 1);

  let comuns = 0;
  for (const g of ba) {
    const n = restantes.get(g) ?? 0;
    if (n > 0) {
      comuns += 1;
      restantes.set(g, n - 1);
    }
  }
  return (2 * comuns) / (ba.length + bb.length);
}

/**
 * Faixas calibradas contra os dados vivos de 2026 × 2025 (ver
 * scripts/regen-avaliacao.ts --dry, que imprime a distribuição).
 * Acima de RENOVACAO o casamento é seguro; abaixo de REVISAR é ruído.
 */
export const LIMIAR = { renovacao: 0.82, revisar: 0.5 } as const;

export interface CandidatoAnterior {
  id: string;
  titulo: string;
  instituicaoId: string | null;
  /** Aprovado do ciclo anterior — é o "quanto recebeu no ano passado". */
  aprovado: number | null;
}

export interface Sugestao {
  tipo: TipoRevisao;
  anteriorId: string | null;
  anteriorTitulo: string | null;
  /** null quando não houve candidato nenhum (instituição nova). */
  similaridade: number | null;
  recebidoAnterior: number | null;
}

const SEM_CANDIDATO: Sugestao = {
  tipo: "novo",
  anteriorId: null,
  anteriorTitulo: null,
  similaridade: null,
  recebidoAnterior: null,
};

/**
 * Melhor candidato do ciclo anterior para um projeto, **dentro da mesma
 * instituição**. Cruzar instituições geraria falso positivo em massa: "Bolsa de
 * Estudos" existe em meia dúzia delas.
 */
export function sugerirVinculo(
  projeto: { titulo: string; instituicaoId: string | null },
  anteriores: CandidatoAnterior[],
): Sugestao {
  if (!projeto.instituicaoId) return SEM_CANDIDATO;

  let melhor: CandidatoAnterior | null = null;
  let melhorNota = 0;
  for (const c of anteriores) {
    if (c.instituicaoId !== projeto.instituicaoId) continue;
    const nota = similaridadeTitulo(projeto.titulo, c.titulo);
    // Empate resolvido pelo id, para o resultado não depender da ordem do SELECT.
    if (
      nota > melhorNota ||
      (nota === melhorNota && melhor && c.id < melhor.id)
    ) {
      melhor = c;
      melhorNota = nota;
    }
  }

  if (!melhor) return SEM_CANDIDATO;

  const tipo: TipoRevisao =
    melhorNota >= LIMIAR.renovacao
      ? "renovacao"
      : melhorNota >= LIMIAR.revisar
        ? "revisar"
        : "novo";

  // Abaixo da faixa de revisão o candidato não é informação, é ruído: some.
  if (tipo === "novo") {
    return { ...SEM_CANDIDATO, similaridade: melhorNota };
  }

  return {
    tipo,
    anteriorId: melhor.id,
    anteriorTitulo: melhor.titulo,
    similaridade: melhorNota,
    recebidoAnterior: melhor.aprovado,
  };
}

/**
 * Divide os projetos entre os avaliadores em quantidades parecidas.
 *
 * Guloso pela menor carga — e a carga já atribuída entra como ponto de partida,
 * porque projeto novo continua chegando até o fim do mês e **quem já recebeu
 * uma pasta não pode vê-la mudar**. Re-rodar só distribui o que sobrou.
 * Empate pela ordem da lista, para o resultado ser reproduzível.
 */
export function distribuir(
  pendentes: string[],
  avaliadores: string[],
  cargaInicial: Map<string, number> = new Map(),
): Map<string, string> {
  const destino = new Map<string, string>();
  if (avaliadores.length === 0) return destino;

  const carga = avaliadores.map((nome) => cargaInicial.get(nome) ?? 0);

  for (const projeto of pendentes) {
    let i = 0;
    for (let j = 1; j < carga.length; j++) if (carga[j]! < carga[i]!) i = j;
    destino.set(projeto, avaliadores[i]!);
    carga[i] = carga[i]! + 1;
  }
  return destino;
}

/**
 * Reequilibra as pastas movendo o **mínimo possível** de projetos.
 *
 * Existe porque as pastas encolhem sozinhas depois de distribuídas: um projeto
 * reclassificado como renovação sai da pasta, um rejeitado também — e o
 * responsável fica com menos que os outros. E um avaliador que entra depois da
 * distribuição começa com zero, já que a rodada normal só mexe em projeto sem dono.
 *
 * A regra é a cota: com `total` projetos e `n` avaliadores, cada um fica com
 * `piso` ou `piso+1`, e a cota maior vai para quem já tem mais — o que minimiza
 * o movimento. Só o que passa da cota é solto e redistribuído; quem já está no
 * ponto **não é tocado**. É a diferença para refazer tudo do zero, que
 * embaralharia a preparação de quem já começou a estudar.
 *
 * Devolve só quem MUDA de dono. Nome fora da lista de avaliadores (atribuição
 * manual) é ignorado, não redistribuído.
 */
export function reequilibrar(
  atribuicoes: { id: string; responsavel: string }[],
  avaliadores: string[],
): Map<string, string> {
  if (avaliadores.length === 0) return new Map();

  const meus = new Map(avaliadores.map((nome) => [nome, [] as string[]]));
  for (const { id, responsavel } of atribuicoes)
    meus.get(responsavel)?.push(id);

  const total = [...meus.values()].reduce((s, l) => s + l.length, 0);
  const piso = Math.floor(total / avaliadores.length);
  const resto = total % avaliadores.length;

  // Cota maior para quem já tem mais: assim quase ninguém precisa se mexer.
  // Empate pelo nome, para a rodada ser reproduzível.
  const cota = new Map(
    [...avaliadores]
      .sort(
        (a, b) =>
          meus.get(b)!.length - meus.get(a)!.length ||
          a.localeCompare(b, "pt-BR"),
      )
      .map((nome, i) => [nome, i < resto ? piso + 1 : piso]),
  );

  const soltos: string[] = [];
  const carga = new Map<string, number>();
  for (const [nome, lista] of meus) {
    // Ordenar pelo id mantém o resultado reproduzível entre rodadas.
    const ordenada = [...lista].sort();
    const q = cota.get(nome)!;
    soltos.push(...ordenada.slice(q));
    carga.set(nome, Math.min(ordenada.length, q));
  }

  const antes = new Map(atribuicoes.map((a) => [a.id, a.responsavel]));
  const destino = distribuir(soltos.sort(), avaliadores, carga);
  // Projeto que o guloso devolveu ao mesmo dono não é movimento nenhum.
  for (const [id, nome] of destino) {
    if (antes.get(id) === nome) destino.delete(id);
  }
  return destino;
}
