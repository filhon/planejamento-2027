/**
 * OS ENVELOPES DA DIRETRIZ (Fase 15): a divisão do teto da remessa definida na
 * reunião, sugerida pelo presidente e corroborada pela diretoria.
 *
 * Três coisas diferentes vivem aqui, e a tela diz qual é qual:
 *  - os **percentuais** são a diretriz, recebida pronta;
 *  - o **envelope de cada projeto** é, nesta ordem: o que a mesa escolheu
 *    (Firestore, coleção `envelopes`) › a avaliação do conteúdo feita na
 *    preparação (`AVALIACAO`, com o motivo em uma linha) › a categoria da origem
 *    (`PADRAO_CATEGORIA`);
 *  - o **mês a mês**: o pedido sai de `meses_parcelas` da origem; a proposta é o
 *    que a mesa ajustou, ou a decisão da pasta, ou o aprovado no sistema.
 *
 * Puro (sem pg/fs/Firestore): o cliente recalcula tudo a cada edição.
 */

export type ChaveEnvelope =
  | "missoes"
  | "construcao"
  | "educacao"
  | "sociais"
  | "misericordia"
  | "administrativo";

export interface Envelope {
  chave: ChaveEnvelope;
  rotulo: string;
  /** Para o seletor compacto da lista de projetos. */
  curto: string;
  /**
   * Fração da receita definida na reunião (os seis somam 1). A mesa pode mudar
   * por ano na tela (`Alvos`, Firestore `envelopes_caixa.alvos`); isto é o
   * ponto de partida e a referência "da reunião".
   */
  alvo: number;
  /** O que entra, em uma linha: é o critério que a mesa contesta. */
  criterio: string;
  /** Não recebe projeto: o valor é digitado mês a mês (custos administrativos). */
  semProjetos?: true;
}

/** Na ordem da diretriz. */
export const ENVELOPES: Envelope[] = [
  {
    chave: "missoes",
    curto: "Missões",
    rotulo: "Missões",
    alvo: 0.5,
    criterio:
      "Missões transculturais e nacionais, plantação de igrejas, sustento e cuidado de missionários, saúde.",
  },
  {
    chave: "construcao",
    curto: "Construção",
    rotulo: "Construção e reforma de igrejas",
    alvo: 0.25,
    criterio: "Obra: construção, reforma, terreno e estrutura física.",
  },
  {
    chave: "educacao",
    curto: "Educação",
    rotulo: "Educação",
    alvo: 0.068,
    criterio: "Bolsas, formação teológica e capacitação de líderes.",
  },
  {
    chave: "sociais",
    curto: "Sociais",
    rotulo: "Projetos sociais cristãos",
    alvo: 0.068,
    criterio:
      "Ação social com propósito cristão: crianças, famílias, recuperação, creches.",
  },
  {
    chave: "misericordia",
    curto: "Misericórdia",
    rotulo: "Social (oferta de misericórdia)",
    alvo: 0.02,
    criterio:
      "Projetos e ofertas para pessoas não cristãs, sem evangelização como fim ou pano de fundo. Nunca atribuído automaticamente.",
  },
  {
    chave: "administrativo",
    curto: "Administrativo",
    rotulo: "Custos administrativos",
    alvo: 0.094,
    criterio: "Custo da operação, digitado mês a mês. Não recebe projeto.",
    semProjetos: true,
  },
];

export const ENVELOPE = Object.fromEntries(
  ENVELOPES.map((e) => [e.chave, e]),
) as Record<ChaveEnvelope, Envelope>;

/** O percentual de cada envelope (fração da receita). */
export type Alvos = Record<ChaveEnvelope, number>;

/** A diretriz da reunião, sem ajuste da mesa. */
export const ALVOS_DIRETRIZ = Object.fromEntries(
  ENVELOPES.map((e) => [e.chave, e.alvo]),
) as Alvos;

/**
 * Valida os percentuais vindos do cliente (ou do banco): os seis envelopes,
 * cada um entre 0 e 1. A soma NÃO precisa dar 1: a mesa muda uma célula por
 * vez, e de 50/25 para 45/30 o caminho passa por 95% (a tela avisa).
 */
export function alvosValidos(v: unknown): Alvos | null {
  if (!v || typeof v !== "object") return null;
  const r = {} as Alvos;
  for (const e of ENVELOPES) {
    const x = Number((v as Record<string, unknown>)[e.chave]);
    if (!Number.isFinite(x) || x < 0 || x > 1) return null;
    r[e.chave] = Math.round(x * 1e6) / 1e6;
  }
  return r;
}

export const somaAlvos = (a: Alvos) =>
  Math.round(ENVELOPES.reduce((s, e) => s + a[e.chave], 0) * 1e6) / 1e6;

export const igualADiretriz = (a: Alvos) =>
  ENVELOPES.every((e) => Math.abs(a[e.chave] - e.alvo) < 1e-7);

/** Os envelopes que um projeto pode receber (o select da tela). */
export const ENVELOPES_DE_PROJETO = ENVELOPES.filter((e) => !e.semProjetos);

export const ehChaveDeProjeto = (v: unknown): v is ChaveEnvelope =>
  ENVELOPES_DE_PROJETO.some((e) => e.chave === v);

/**
 * Ponto de partida pela categoria da origem. Saúde vai para Missões por decisão
 * da diretoria; "outros" também, porque na remessa 2026 é quase todo cuidado e
 * mobilização missionária. Misericórdia nunca é padrão.
 */
export const PADRAO_CATEGORIA: Record<string, ChaveEnvelope> = {
  "missoes-transculturais": "missoes",
  "missoes-nacionais": "missoes",
  saude: "missoes",
  outros: "missoes",
  "construcao-reforma": "construcao",
  educacao: "educacao",
  "projetos-sociais-cristaos": "sociais",
};

/**
 * Onde a leitura do conteúdo (título, descrição, natureza) da Remessa 2026
 * discorda da categoria escolhida pelo proponente. Os demais seguem a categoria.
 */
export const AVALIACAO: Record<string, [ChaveEnvelope, string]> = {
  "fb310421-a4b0-4daa-9942-7fba99ef7a51": [
    "sociais",
    "Casa de apoio que hospeda militares em tratamento: acolhimento, não obra de igreja.",
  ],
  "38aa283b-1c47-4d3f-8bed-7de33dffaa8b": [
    "missoes",
    "Projeto missionário na Síria; esporte e saúde são a plataforma de evangelização.",
  ],
  "a047763b-8a6a-4e84-8a11-2214ccdad701": [
    "missoes",
    "Formação de líderes e multiplicação de igrejas em Guiné-Bissau.",
  ],
  "6da712aa-3fe7-47ff-bb35-9166b41bee6c": [
    "construcao",
    "Recuperação do telhado do templo: obra em igreja.",
  ],
  "2e173064-1afd-4bed-9481-0545f1c48af1": [
    "construcao",
    "Construção do espaço do departamento infantil da igreja.",
  ],
  "725e97c1-ef3d-4206-9a49-62151e112d02": [
    "sociais",
    "Creche: nutrição, cuidado e alfabetização de crianças.",
  ],
  "5296e50f-2963-4c84-97ee-cabb8d0e8ad1": [
    "sociais",
    "Alimentação dos alunos de uma escola cristã: ação social.",
  ],
  "10010205-ccdf-4ced-81fa-d0b6dd1c9344": [
    "educacao",
    "Bolsas de estudo teológico.",
  ],
  "e30f1a1d-1d2d-4c69-bff3-4b67a855f1d6": [
    "construcao",
    "Construção do templo da congregação.",
  ],
  "36c6e6a5-a946-4ad0-906e-0b577ff7288e": [
    "missoes",
    "Congresso de despertamento missionário: mobilização, não ensino.",
  ],
  "fcf367e3-5ea5-4b92-a242-caa4db37e427": [
    "missoes",
    "Organização de uma congregação: plantação de igreja.",
  ],
  "9829e2ae-4793-4f80-b235-819c3e85eb60": [
    "construcao",
    "Divisórias e forro para salas da igreja: obra.",
  ],
  "d5c7cdd3-7a3c-4780-b65d-24aa998b5555": [
    "construcao",
    "Reforma da cozinha e do refeitório de um seminário: obra, embora não em templo.",
  ],
  "e9ec7901-c5f3-40ca-a761-295d52328f9b": [
    "sociais",
    "Atendimento a crianças em vulnerabilidade, não ensino formal.",
  ],
  "42aa7de7-a7cc-4927-8898-6a0152b7ea37": [
    "educacao",
    "Capacitação de pastores e líderes: formação.",
  ],
};

export type OrigemEnvelope = "mesa" | "avaliacao" | "categoria" | "sem";

export interface Atribuicao {
  chave: ChaveEnvelope | null;
  origem: OrigemEnvelope;
  /** Por que este envelope (a avaliação), ou null. */
  motivo: string | null;
}

/** O envelope de um projeto: mesa › avaliação › categoria. */
export function atribuir(
  p: { id: string; categoria: string },
  curado?: ChaveEnvelope | null,
): Atribuicao {
  if (curado) return { chave: curado, origem: "mesa", motivo: null };
  const avaliado = AVALIACAO[p.id];
  if (avaliado)
    return { chave: avaliado[0], origem: "avaliacao", motivo: avaliado[1] };
  const padrao = PADRAO_CATEGORIA[p.categoria];
  return padrao
    ? { chave: padrao, origem: "categoria", motivo: null }
    : { chave: null, origem: "sem", motivo: null };
}

// ---------------------------------------------------------------- mês a mês

export const MESES = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
] as const;

export const ZERO_MESES = (): number[] => Array(12).fill(0);

export const somaMeses = (m: number[]): number =>
  Math.round(m.reduce((s, v) => s + v, 0) * 100) / 100;

/**
 * Divide `valor` igualmente nos `meses` (1..12), em centavos, com o resto
 * centavo a centavo nos primeiros, para a soma bater exata.
 */
export function distribuir(valor: number, meses: number[]): number[] {
  const alvo = meses.length > 0 ? meses : MESES.map((_, i) => i + 1);
  const centavos = Math.round(valor * 100);
  const base = Math.floor(centavos / alvo.length);
  let resto = centavos - base * alvo.length;
  const r = ZERO_MESES();
  for (const m of alvo) r[m - 1] = (base + (resto-- > 0 ? 1 : 0)) / 100;
  return r;
}

/**
 * Os meses de pagamento que o proponente marcou (`meses_parcelas`, texto "01".."12"
 * na origem). Vazio ou ilegível = não informado (34 projetos em 2026): aí o pedido
 * é dividido em 12, e a tela diz que foi assim.
 */
export function mesesDaParcela(bruto: unknown[] | null | undefined): number[] {
  const meses = [
    ...new Set((bruto ?? []).map(Number).filter((m) => m >= 1 && m <= 12)),
  ];
  return meses.sort((a, b) => a - b);
}

export type FonteProposta =
  "ajuste" | "decisao" | "sistema" | "pedido" | "zerado";

export const ROTULO_FONTE: Record<FonteProposta, string> = {
  ajuste: "ajustado na mesa",
  decisao: "decisão da pasta",
  sistema: "aprovado no sistema",
  pedido: "pedido do proponente",
  zerado: "fora: decisão da pasta",
};

/** Situações da decisão da pasta que tiram o projeto da conta. */
export const SITUACOES_SEM_VALOR = ["reprovado", "adiado", "devolvido-ajuste"];

export interface LinhaProjeto {
  meses: number[];
  /** Pedido distribuído nos meses do proponente. */
  pedidoMeses: number[];
  /** O que a proposta usa, nesta ordem. */
  propostaMeses: number[];
  fonte: FonteProposta;
  mesesInformados: boolean;
}

/**
 * A linha de um projeto na tela. Precedência da proposta:
 * decisão negativa na pasta (zera) › ajuste da mesa › valor da decisão na pasta
 * › aprovado no sistema › pedido.
 */
export function linhaProjeto(
  p: {
    solicitado: number;
    aprovado: number | null;
    status: string;
    mesesParcelas: unknown[] | null;
  },
  ajuste: number[] | null,
  decisao: { situacao: string | null; valorAprovado: number | null } | null,
): LinhaProjeto {
  const meses = mesesDaParcela(p.mesesParcelas);
  const pedidoMeses = distribuir(p.solicitado, meses);
  const base = { meses, pedidoMeses, mesesInformados: meses.length > 0 };

  if (decisao?.situacao && SITUACOES_SEM_VALOR.includes(decisao.situacao))
    return { ...base, propostaMeses: ZERO_MESES(), fonte: "zerado" };
  if (ajuste && ajuste.length === 12)
    return { ...base, propostaMeses: ajuste, fonte: "ajuste" };
  if (decisao?.valorAprovado != null)
    return {
      ...base,
      propostaMeses: distribuir(decisao.valorAprovado, meses),
      fonte: "decisao",
    };
  if (p.status === "aprovado" && p.aprovado != null && p.aprovado > 0)
    return {
      ...base,
      propostaMeses: distribuir(p.aprovado, meses),
      fonte: "sistema",
    };
  return { ...base, propostaMeses: pedidoMeses, fonte: "pedido" };
}

// ------------------------------------------- a ordem da lista (classificação)

/**
 * Os quatro grupos da lista, nesta ordem: aprovados (no sistema ou pela
 * decisão da pasta) · votados ainda sem decisão · sem voto · fora da proposta
 * (decisão da pasta reprovado/adiado/devolvido), que vão para o fim.
 */
export type GrupoLista = 0 | 1 | 2 | 3;

export const ROTULO_GRUPO: Record<GrupoLista, string> = {
  0: "Aprovados",
  1: "Votados, sem decisão",
  2: "Sem voto",
  3: "Fora da proposta (decisão da pasta)",
};

const APROVA_NA_PASTA = ["aprovado", "aprovado-ressalvas"];

export function grupoNaLista(
  p: { status: string; avaliacoes: number },
  situacaoNaPasta: string | null,
): GrupoLista {
  if (situacaoNaPasta && SITUACOES_SEM_VALOR.includes(situacaoNaPasta))
    return 3;
  if (
    p.status === "aprovado" ||
    APROVA_NA_PASTA.includes(situacaoNaPasta ?? "")
  )
    return 0;
  return p.avaliacoes > 0 ? 1 : 2;
}

/**
 * Classificação padrão: grupo, e dentro dele a maior nota média (a mediana e o
 * número de notas desempatam); sem nota, o maior pedido.
 */
export function compararNaLista(
  a: {
    grupo: GrupoLista;
    notaMedia: number | null;
    notaMediana: number | null;
    avaliacoes: number;
    solicitado: number;
  },
  b: typeof a,
): number {
  return (
    a.grupo - b.grupo ||
    (b.notaMedia ?? -1) - (a.notaMedia ?? -1) ||
    (b.notaMediana ?? -1) - (a.notaMediana ?? -1) ||
    b.avaliacoes - a.avaliacoes ||
    b.solicitado - a.solicitado
  );
}

// ------------------------------------------------------- quadro por envelope

export interface LinhaQuadro {
  envelope: Envelope | null;
  chave: ChaveEnvelope | null;
  rotulo: string;
  /** O percentual em vigor (o da mesa, se houver); null sem envelope. */
  alvo: number | null;
  projetos: number;
  pedido: number;
  proposta: number;
  propostaMeses: number[];
  /** receita × alvo (null sem receita conhecida). */
  limite: number | null;
  /** limite − proposta: negativo = estourou. */
  saldo: number | null;
}

/**
 * Soma a proposta por envelope contra `receita × diretriz`. O administrativo
 * entra com os meses do caixa (digitados ou reserva; pedido = proposta). Projeto
 * sem envelope soma numa linha própria, para não sumir da conta.
 */
export function montarQuadro(
  linhas: {
    chave: ChaveEnvelope | null;
    pedido: number;
    propostaMeses: number[];
  }[],
  administrativo: number[],
  receita: number | null,
  alvos: Alvos = ALVOS_DIRETRIZ,
): { linhas: LinhaQuadro[]; total: LinhaQuadro } {
  const teto = receita;
  const nova = (envelope: Envelope | null, rotulo: string): LinhaQuadro => ({
    envelope,
    chave: envelope?.chave ?? null,
    rotulo,
    alvo: envelope ? alvos[envelope.chave] : null,
    projetos: 0,
    pedido: 0,
    proposta: 0,
    propostaMeses: ZERO_MESES(),
    limite: envelope && teto !== null ? teto * alvos[envelope.chave] : null,
    saldo: null,
  });
  const por = new Map<ChaveEnvelope | null, LinhaQuadro>(
    ENVELOPES.map((e) => [e.chave, nova(e, e.rotulo)]),
  );
  const somar = (q: LinhaQuadro, pedido: number, meses: number[]) => {
    q.pedido += pedido;
    meses.forEach((v, i) => (q.propostaMeses[i]! += v));
  };

  for (const l of linhas) {
    if (!por.has(l.chave)) por.set(l.chave, nova(null, "Sem envelope"));
    const q = por.get(l.chave)!;
    q.projetos++;
    somar(q, l.pedido, l.propostaMeses);
  }
  somar(por.get("administrativo")!, somaMeses(administrativo), administrativo);

  const total = nova(null, "Total");
  total.limite = teto;
  const resultado = [...por.values()];
  for (const q of resultado) {
    q.propostaMeses = q.propostaMeses.map((v) => Math.round(v * 100) / 100);
    q.proposta = somaMeses(q.propostaMeses);
    q.pedido = Math.round(q.pedido * 100) / 100;
    q.saldo = q.limite === null ? null : q.limite - q.proposta;
    total.projetos += q.projetos;
    somar(total, q.pedido, q.propostaMeses);
  }
  total.proposta = somaMeses(total.propostaMeses);
  total.saldo = teto === null ? null : teto - total.proposta;
  return { linhas: resultado, total };
}

// ------------------------------------------------------------ gravação

const centavos = (x: number) => Math.round(x * 100) / 100;
const valorValido = (x: number) => Number.isFinite(x) && x >= 0 && x <= 1e9;

/** Valida os 12 meses vindos do cliente (Server Action). */
export function mesesValidos(v: unknown): number[] | null {
  if (!Array.isArray(v) || v.length !== 12) return null;
  const r = v.map(Number);
  return r.every(valorValido) ? r.map(centavos) : null;
}

/** Idem, com `null` = mês não digitado (receita e administrativo do caixa). */
export function mesesComVazio(v: unknown): (number | null)[] | null {
  if (!Array.isArray(v) || v.length !== 12) return null;
  const r = v.map((x) => (x === null || x === undefined ? null : Number(x)));
  return r.every((x) => x === null || valorValido(x))
    ? r.map((x) => (x === null ? null : centavos(x)))
    : null;
}

// --------------------------------------------------- caixa (receita × saída)

/**
 * A RECEITA do ano, de onde saem os percentuais (Fase 15b). A origem guarda a
 * conta em `resource_allocations`: faturamento × % de doação × margem de
 * segurança = receita; menos custos administrativos = o "teto" dos projetos.
 * Aplicar a diretriz sobre o teto descontava o administrativo duas vezes (a
 * diretriz já tem a fatia de 9,4% dele). Sem os três campos, teto + custos.
 */
export function receitaDoSistema(
  o:
    | {
        faturamento: number | null;
        porcentagemDoacao: number | null;
        margemSeguranca: number | null;
        custosAdministrativos: number | null;
        tetoTotal: number | null;
      }
    | null
    | undefined,
): number | null {
  if (!o) return null;
  if (o.faturamento && o.porcentagemDoacao && o.margemSeguranca)
    return centavos(
      (o.faturamento * o.porcentagemDoacao * o.margemSeguranca) / 10000,
    );
  if (o.tetoTotal) return o.tetoTotal + (o.custosAdministrativos ?? 0);
  return null;
}

/** Mês a mês com o digitado por cima do padrão: o que vale e o que foi digitado. */
export function preencher(
  digitados: (number | null)[] | null,
  padrao: number[],
): { valores: number[]; digitado: boolean[] } {
  const digitado = padrao.map((_, i) => digitados?.[i] != null);
  return {
    valores: padrao.map((v, i) => (digitado[i] ? digitados![i]! : v)),
    digitado,
  };
}

export interface CaixaAno {
  /** Receita anual sugerida pelo sistema (antes de qualquer digitação). */
  receitaSistema: number | null;
  receitaMeses: number[];
  receitaDigitada: boolean[];
  /** Soma da receita efetiva: é a base dos percentuais. */
  receita: number | null;
  adminMeses: number[];
  /** false = reserva da diretriz (receita do mês × 9,4%), ainda não digitado. */
  adminDigitado: boolean[];
  admin: number;
  saldoInicial: number;
  /** Os percentuais em vigor: os da mesa, ou a diretriz da reunião. */
  alvos: Alvos;
  /** true = a mesa mudou algum percentual neste ano. */
  alvosDigitados: boolean;
}

/**
 * Junta o que o sistema sabe (receita) com o que a mesa digitou (receita,
 * administrativo e saldo inicial, por mês). Mês não digitado vale o padrão:
 * receita ÷ 12, e administrativo = a fatia da diretriz sobre a receita do mês.
 * Digitar um mês não apaga a reserva dos outros.
 */
export function montarCaixaAno(
  receitaSistema: number | null,
  digitado: {
    receita: (number | null)[] | null;
    admin: (number | null)[] | null;
    saldoInicial: number | null;
    alvos?: Alvos | null;
  },
): CaixaAno {
  const alvos = digitado.alvos ?? ALVOS_DIRETRIZ;
  const r = preencher(
    digitado.receita,
    receitaSistema === null ? ZERO_MESES() : distribuir(receitaSistema, []),
  );
  const conhecida = receitaSistema !== null || r.digitado.some(Boolean);
  const a = preencher(
    digitado.admin,
    r.valores.map((v) => centavos(v * alvos.administrativo)),
  );
  return {
    receitaSistema,
    receitaMeses: r.valores,
    receitaDigitada: r.digitado,
    receita: conhecida ? somaMeses(r.valores) : null,
    adminMeses: a.valores,
    adminDigitado: a.digitado,
    admin: somaMeses(a.valores),
    saldoInicial: digitado.saldoInicial ?? 0,
    alvos,
    alvosDigitados: !!digitado.alvos,
  };
}

/**
 * Fluxo de caixa mês a mês: o saldo inicial de cada mês é o acumulado do
 * anterior; saldo do mês = receita − saídas.
 */
export function fluxo(
  saldoInicial: number,
  receita: number[],
  saidas: number[][],
): {
  saida: number[];
  inicial: number[];
  saldoMes: number[];
  acumulado: number[];
} {
  const saida = receita.map((_, i) =>
    centavos(saidas.reduce((s, linha) => s + (linha[i] ?? 0), 0)),
  );
  const saldoMes = receita.map((v, i) => centavos(v - saida[i]!));
  const inicial: number[] = [];
  const acumulado: number[] = [];
  let corrente = saldoInicial;
  for (const v of saldoMes) {
    inicial.push(centavos(corrente));
    corrente += v;
    acumulado.push(centavos(corrente));
  }
  return { saida, inicial, saldoMes, acumulado };
}

// ------------------------------------------- o que fazer com a parcela tirada

export type DestinoParcela = "adiar" | "redistribuir" | "cortar";

export const ROTULO_DESTINO: Record<DestinoParcela, string> = {
  adiar: "Passar para o mês seguinte",
  redistribuir: "Redistribuir nos outros meses",
  cortar: "Cortar (o projeto recebe menos)",
};

/**
 * O mês `i` passou a valer `novo`, abaixo do que estava: para onde vai a
 * diferença? `adiar` soma no mês seguinte; `redistribuir` espalha igualmente
 * nos outros meses que já têm parcela (ou em todos os outros, se nenhum tem);
 * `cortar` deixa o total cair. Os dois primeiros mantêm o total do projeto.
 * Devolve null quando o destino não se aplica (adiar em dezembro).
 */
export function tirarDoMes(
  meses: number[],
  i: number,
  novo: number,
  destino: DestinoParcela,
): number[] | null {
  const diferenca = centavos(meses[i]! - novo);
  const r = meses.map((v, j) => (j === i ? novo : v));
  if (destino === "cortar" || diferenca <= 0) return r;
  if (destino === "adiar") {
    if (i >= 11) return null;
    r[i + 1] = centavos(r[i + 1]! + diferenca);
    return r;
  }
  const comParcela = r
    .map((v, j) => (j !== i && v > 0 ? j + 1 : 0))
    .filter(Boolean);
  const alvo = comParcela.length
    ? comParcela
    : MESES.map((_, j) => j + 1).filter((m) => m !== i + 1);
  const extra = distribuir(diferenca, alvo);
  return r.map((v, j) => centavos(v + extra[j]!));
}

/**
 * Para digitar o TOTAL: espalha nos meses que hoje têm parcela (a mesa pode ter
 * espalhado em 12 antes); se nenhum tem, nos meses do pedido; sem eles, em 12.
 */
export function mesesParaTotal(atual: number[], doPedido: number[]): number[] {
  const comParcela = atual.map((v, j) => (v > 0 ? j + 1 : 0)).filter(Boolean);
  return comParcela.length ? comParcela : doPedido;
}

/** Posição com empate (1º, 1º, 3º…): "5,0" no topo de 28 projetos é empate. */
export function posicoes(notas: (number | null)[]): number[] {
  const r: number[] = [];
  notas.forEach((n, i) => {
    r.push(i > 0 && n !== null && notas[i - 1] === n ? r[i - 1]! : i + 1);
  });
  return r;
}
