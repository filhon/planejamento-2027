/**
 * A PLANILHA DE ENVELOPES (Fase 15e): a tela inteira num .xlsx que a diretoria
 * pode mexer fora da reunião, com as contas vivas.
 *
 * Quatro abas: Leia-me (situação, legenda, como usar), Caixa, Envelopes e
 * Projetos. **Projetos é a única fonte**: Caixa e Envelopes somam por SOMASES
 * na coluna Envelope dela, então trocar um envelope na lista ou uma parcela
 * recalcula tudo. Percentual (Envelopes!C), receita e administrativo
 * (Caixa) também são entradas. Célula azul-clara com borda = editável.
 *
 * Toda fórmula leva o valor que a tela calculou (para quem só pré-visualiza);
 * o Excel recalcula ao abrir. Nada da planilha volta ao painel.
 *
 * Puro: roda no cliente (o botão) e no Node (o teste).
 */

import {
  ENVELOPE,
  ENVELOPES,
  ENVELOPES_DE_PROJETO,
  MESES,
  ROTULO_FONTE,
  type CaixaAno,
  type ChaveEnvelope,
  type FonteProposta,
  type LinhaQuadro,
  type fluxo,
} from "./envelopes";
import {
  coluna,
  pasta,
  refAba,
  type Celula,
  type Estilo,
  type Rica,
} from "./xlsx";

export interface ProjetoPlanilha {
  numero: number;
  titulo: string;
  link: string;
  instituicao: string | null;
  chave: ChaveEnvelope | null;
  /** De onde veio o envelope, em texto ("mesa", "avaliação: …", "categoria"). */
  origem: string;
  grupo: string;
  nota: number | null;
  pedido: number;
  pedidoMeses: number[];
  propostaMeses: number[];
  fonte: FonteProposta;
}

export interface DadosPlanilha {
  ano: number;
  geradoEm: string;
  caixa: CaixaAno;
  quadro: { linhas: LinhaQuadro[]; total: LinhaQuadro };
  fx: ReturnType<typeof fluxo>;
  tetoSistema: number | null;
  /** Na ordem da classificação da tela. */
  projetos: ProjetoPlanilha[];
}

const ABA = {
  leia: "Leia-me",
  caixa: "Caixa",
  envelopes: "Envelopes",
  projetos: "Projetos",
};

/** A chave de junção entre as abas: o rótulo curto do envelope. */
export const SEM_ENVELOPE = "Sem envelope";
const chaveTexto = (c: ChaveEnvelope | null) =>
  c ? ENVELOPE[c].curto : SEM_ENVELOPE;

const c2 = (x: number) => Math.round(x * 100) / 100;
const soma = (xs: number[]) => c2(xs.reduce((s, v) => s + v, 0));
const t = (v: string | number | null, s: Estilo): Rica => ({ v, s });
const f = (formula: string, v: number | string | null, s: Estilo): Rica => ({
  f: formula,
  v: typeof v === "number" ? c2(v) : v,
  s,
});

/** Folga para linhas que a mesa acrescentar no Excel (validação e somas). */
const FOLGA = 200;

export function planilhaEnvelopes(d: DadosPlanilha): Uint8Array<ArrayBuffer> {
  const { caixa, quadro, fx, projetos } = d;
  const receita = caixa.receita ?? 0;
  const rodape = `Hebron ASEEC · Envelopes · Remessa ${d.ano} · ${d.geradoEm}`;
  const temSem = quadro.linhas.some((q) => q.chave === null);

  // --------------------------------------------------- geometria das abas
  // Projetos: título, subtítulo, vazio, soma do filtro, cabeçalho, dados.
  const P0 = 6;
  const PN = Math.max(P0, P0 + projetos.length - 1);
  const PX = PN + FOLGA;
  const colMes = (i: number) => coluna(10 + i); // K..V
  const colPedMes = (i: number) => coluna(22 + i); // W..AH
  const proj = (col: string, abs = true) =>
    `${refAba(ABA.projetos)}!${abs ? "$" : ""}${col}$${P0}:${abs ? "$" : ""}${col}$${PX}`;
  const CRIT = proj("C");

  // Envelopes: cabeçalho na 4, os seis envelopes de 5 a 10, "sem" na 11.
  const E0 = 5;
  const linhaEnv = (c: ChaveEnvelope) =>
    E0 + ENVELOPES.findIndex((e) => e.chave === c);
  const EADM = linhaEnv("administrativo");
  const ESEM = EADM + 1;
  const ET = temSem ? ESEM + 1 : ESEM;

  // Caixa: as linhas fixas e as dos envelopes de projeto.
  const envCaixa: (ChaveEnvelope | null)[] = [
    ...ENVELOPES_DE_PROJETO.map((e) => e.chave),
    ...(temSem ? [null] : []),
  ];
  const C_REC_SIS = 5;
  const C_SALDO_INI = 6;
  const C_REC_DIG = 8;
  const C_ADM_DIG = 9;
  const C_INI = 11;
  const C_REC = 12;
  const C_ADM = 13;
  const C_PROJ = 14;
  const C_ENV0 = 15;
  const C_SALDO = C_ENV0 + envCaixa.length;
  const C_ACUM = C_SALDO + 1;

  const nomes = [
    { nome: "ReceitaSistema", ref: `${refAba(ABA.caixa)}!$B$${C_REC_SIS}` },
    { nome: "SaldoInicial", ref: `${refAba(ABA.caixa)}!$B$${C_SALDO_INI}` },
    { nome: "Receita", ref: `${refAba(ABA.caixa)}!$B$${C_REC}` },
    { nome: "AdminAno", ref: `${refAba(ABA.caixa)}!$B$${C_ADM}` },
    { nome: "AlvoAdmin", ref: `${refAba(ABA.envelopes)}!$C$${EADM}` },
    {
      nome: "ListaEnvelopes",
      ref: `${refAba(ABA.envelopes)}!$A$${E0}:$A$${E0 + ENVELOPES_DE_PROJETO.length - 1}`,
    },
  ];

  const porChave = new Map(quadro.linhas.map((q) => [q.chave, q]));
  const projetosMeses = MESES.map((_, i) =>
    c2(
      quadro.linhas
        .filter((q) => q.chave !== "administrativo")
        .reduce((s, q) => s + q.propostaMeses[i]!, 0),
    ),
  );

  // ================================================================ Projetos
  const fora = ROTULO_FONTE.zerado;
  const cabProjetos: Celula[] = [
    t("Nº", "cabecalhoNTopo"),
    t("Projeto", "cabecalhoTopo"),
    t("Envelope ✎", "cabecalhoTopo"),
    t("Origem do envelope (na exportação)", "cabecalhoTopo"),
    t("Instituição", "cabecalhoTopo"),
    t("Grupo na classificação", "cabecalhoTopo"),
    t("Nota", "cabecalhoNTopo"),
    t("Pedido", "cabecalhoNTopo"),
    t("Proposta", "cabecalhoNTopo"),
    t("Fonte da proposta (na exportação)", "cabecalhoTopo"),
    ...MESES.map((m) => t(`${m} ✎`, "cabecalhoNTopo")),
    ...MESES.map((m) => t(`pedido ${m}`, "cabecalhoNTopo")),
  ];
  const linhasProjetos: Celula[][] = projetos.map((p, idx) => {
    const r = P0 + idx;
    const zerado = p.fonte === "zerado";
    return [
      t(p.numero, "inteiro"),
      { v: p.titulo, link: p.link, s: "link" },
      t(chaveTexto(p.chave), zerado ? "textoCinza" : "entradaTexto"),
      t(p.origem, "textoCinza"),
      t(p.instituicao ?? "Sem instituição", "texto"),
      t(p.grupo, "texto"),
      t(p.nota === null ? null : Math.round(p.nota * 10) / 10, "nota"),
      t(p.pedido, "moeda"),
      f(
        `SUM(K${r}:V${r})`,
        soma(p.propostaMeses),
        zerado ? "cinzaMoeda" : "moeda",
      ),
      t(ROTULO_FONTE[p.fonte], "textoCinza"),
      ...p.propostaMeses.map((v) => t(v, zerado ? "cinzaMes" : "entradaMes")),
      ...p.pedidoMeses.map((v) => t(v, "cinzaMes")),
    ];
  });
  const subtotal = (col: string, v: number, s: Estilo) =>
    f(`SUBTOTAL(109,${col}${P0}:${col}${PX})`, v, s);
  const somaProjetos: Celula[] = [
    t(null, "totalTexto"),
    t("Soma da lista (segue o filtro da planilha)", "totalTexto"),
    ...Array.from({ length: 5 }, () => t(null, "totalTexto")),
    subtotal("H", soma(projetos.map((p) => p.pedido)), "total"),
    subtotal("I", soma(projetos.map((p) => soma(p.propostaMeses))), "total"),
    t(null, "totalTexto"),
    ...MESES.map((_, i) =>
      subtotal(
        colMes(i),
        soma(projetos.map((p) => p.propostaMeses[i]!)),
        "totalMes",
      ),
    ),
    ...MESES.map((_, i) =>
      subtotal(
        colPedMes(i),
        soma(projetos.map((p) => p.pedidoMeses[i]!)),
        "totalMes",
      ),
    ),
  ];

  const abaProjetos = {
    nome: ABA.projetos,
    cor: "EA5A06",
    linhas: [
      [t(`Projetos · Remessa ${d.ano}`, "titulo")],
      [
        t(
          `Todos os ${projetos.length} projetos avaliáveis, na classificação da tela (aprovados › votados › sem voto › fora da proposta). Editáveis (azul): o Envelope, pela lista, e as parcelas de jan a dez. O pedido mês a mês está nas colunas recolhidas à direita (botão + no topo).`,
          "subtitulo",
        ),
      ],
      [],
      somaProjetos,
      cabProjetos,
      ...linhasProjetos,
    ],
    larguras: [
      6,
      46,
      14,
      34,
      30,
      20,
      7,
      15,
      15,
      20,
      ...MESES.map(() => 11),
      ...MESES.map(() => 11),
    ],
    alturas: { 1: 24, 2: 30, 5: 34 },
    mesclar: ["A1:J1", "A2:V2"],
    congelar: 5,
    congelarColunas: 3,
    filtro: `A5:${colPedMes(11)}${PN}`,
    grupoColunas: { de: 22, ate: 33, recolhido: true },
    imprimirTitulos: "$5:$5",
    areaImpressao: `$A$1:$V$${PN}`,
    paisagem: true,
    rodape,
    alertas: [
      {
        ref: `C${P0}:C${PX}`,
        formula: `AND(C${P0}<>"",COUNTIF(ListaEnvelopes,C${P0})=0)`,
        dxf: "alerta" as const,
      },
      {
        ref: `K${P0}:V${PX}`,
        formula: `AND($J${P0}<>"${fora}",ROUND(K${P0}-W${P0},2)<>0)`,
        dxf: "ajustado" as const,
      },
    ],
    validacoes: [
      {
        ref: `C${P0}:C${PX}`,
        lista: "ListaEnvelopes",
        titulo: "Envelope do projeto",
        dica: "Escolha na lista. Envelopes e Caixa recalculam na hora.",
        erro: "Use um dos envelopes da lista: Missões, Construção, Educação, Sociais ou Misericórdia.",
      },
      {
        ref: `K${P0}:V${PX}`,
        min: 0,
        titulo: "Parcela do mês (R$)",
        dica: "Valor da parcela neste mês. A proposta, o envelope e o caixa recalculam.",
        erro: "Digite um valor em reais, zero ou positivo.",
      },
    ],
  };

  // =================================================================== Caixa
  const mesesLinha = (gerar: (i: number, c: string) => Celula): Celula[] =>
    MESES.map((_, i) => gerar(i, coluna(2 + i)));
  const linhaCaixa = (
    rotulo: Celula,
    ano: Celula,
    meses: Celula[],
  ): Celula[] => [rotulo, ano, ...meses];

  const linhasCaixa: Celula[][] = [];
  linhasCaixa[0] = [t(`Caixa mês a mês · Remessa ${d.ano}`, "titulo")];
  linhasCaixa[1] = [
    t(
      "Receita menos saídas. Itálico cinza = valor padrão (receita do sistema ÷ 12; administrativo = percentual da receita do mês). Digite nas células azuis; apague para voltar ao padrão. Remessa inteira, sem filtro.",
      "subtitulo",
    ),
  ];
  linhasCaixa[3] = [
    t("Em R$", "cabecalho"),
    t("Ano", "cabecalhoN"),
    ...MESES.map((m) => t(m, "cabecalhoN")),
  ];
  linhasCaixa[C_REC_SIS - 1] = [
    t("Receita do sistema (anual)", "rotulo"),
    t(caixa.receitaSistema, "entradaMoeda"),
    t(
      "faturamento × doação × margem, do sistema de submissão; base dos meses não digitados",
      "textoCinza",
    ),
  ];
  linhasCaixa[C_SALDO_INI - 1] = [
    t("Saldo inicial do ano", "rotulo"),
    t(caixa.saldoInicial || null, "entradaMoeda"),
    t(
      "dinheiro em caixa no começo de janeiro; pode ser negativo",
      "textoCinza",
    ),
  ];
  linhasCaixa[C_REC_DIG - 2] = [
    t("Digitado pela mesa (em branco = valor padrão)", "faixa"),
    ...Array.from({ length: 13 }, () => t(null, "faixa")),
  ];
  linhasCaixa[C_REC_DIG - 1] = linhaCaixa(
    t("Receita digitada", "rotulo"),
    t(null, "texto"),
    mesesLinha((i) =>
      t(caixa.receitaDigitada[i] ? caixa.receitaMeses[i]! : null, "entradaMes"),
    ),
  );
  linhasCaixa[C_ADM_DIG - 1] = linhaCaixa(
    t("Custos administrativos digitados", "rotulo"),
    t(null, "texto"),
    mesesLinha((i) =>
      t(caixa.adminDigitado[i] ? caixa.adminMeses[i]! : null, "entradaMes"),
    ),
  );
  linhasCaixa[C_INI - 2] = [
    t("Fluxo", "faixa"),
    ...Array.from({ length: 13 }, () => t(null, "faixa")),
  ];
  linhasCaixa[C_INI - 1] = linhaCaixa(
    t("Saldo inicial do mês", "rotulo"),
    f(`C${C_INI}`, fx.inicial[0]!, "mes"),
    mesesLinha((i) =>
      f(
        i === 0 ? "SaldoInicial" : `${coluna(1 + i)}${C_ACUM}`,
        fx.inicial[i]!,
        "mes",
      ),
    ),
  );
  linhasCaixa[C_REC - 1] = linhaCaixa(
    t("Receita prevista", "rotulo"),
    f(`SUM(C${C_REC}:N${C_REC})`, receita, "mes"),
    mesesLinha((i, c) =>
      f(
        `IF(ISBLANK(${c}${C_REC_DIG}),ReceitaSistema/12,${c}${C_REC_DIG})`,
        caixa.receitaMeses[i]!,
        "mes",
      ),
    ),
  );
  linhasCaixa[C_ADM - 1] = linhaCaixa(
    t("(−) Custos administrativos", "rotulo"),
    f(`SUM(C${C_ADM}:N${C_ADM})`, caixa.admin, "mes"),
    mesesLinha((i, c) =>
      f(
        `IF(ISBLANK(${c}${C_ADM_DIG}),ROUND(${c}${C_REC}*AlvoAdmin,2),${c}${C_ADM_DIG})`,
        caixa.adminMeses[i]!,
        "mes",
      ),
    ),
  );
  linhasCaixa[C_PROJ - 1] = linhaCaixa(
    t("(−) Projetos", "rotulo"),
    f(`SUM(C${C_PROJ}:N${C_PROJ})`, soma(projetosMeses), "mes"),
    mesesLinha((i, c) =>
      f(`SUM(${c}${C_ENV0}:${c}${C_SALDO - 1})`, projetosMeses[i]!, "mes"),
    ),
  );
  envCaixa.forEach((chave, j) => {
    const r = C_ENV0 + j;
    const q = porChave.get(chave);
    linhasCaixa[r - 1] = linhaCaixa(
      t(chaveTexto(chave), "rotuloRecuado"),
      f(`SUM(C${r}:N${r})`, q?.proposta ?? 0, "mes"),
      mesesLinha((i, c) =>
        f(
          `SUMIFS(${proj(colMes(i), false)},${CRIT},$A${r})`,
          q?.propostaMeses[i] ?? 0,
          "mes",
        ),
      ),
    );
  });
  linhasCaixa[C_SALDO - 1] = linhaCaixa(
    t("= Saldo do mês", "totalTexto"),
    f(`SUM(C${C_SALDO}:N${C_SALDO})`, soma(fx.saldoMes), "totalMes"),
    mesesLinha((i, c) =>
      f(`${c}${C_REC}-${c}${C_ADM}-${c}${C_PROJ}`, fx.saldoMes[i]!, "totalMes"),
    ),
  );
  linhasCaixa[C_ACUM - 1] = linhaCaixa(
    t("= Saldo acumulado", "totalTexto"),
    f(`N${C_ACUM}`, fx.acumulado[11]!, "totalMes"),
    mesesLinha((i, c) =>
      f(`${c}${C_INI}+${c}${C_SALDO}`, fx.acumulado[i]!, "totalMes"),
    ),
  );
  const C_CONF = C_ACUM + 2;
  linhasCaixa[C_CONF - 1] = [
    t("Conferência", "faixa"),
    ...Array.from({ length: 13 }, () => t(null, "faixa")),
  ];
  linhasCaixa[C_CONF] = [
    t("Receita (base dos percentuais)", "rotulo"),
    f("Receita", receita, "moeda"),
  ];
  linhasCaixa[C_CONF + 1] = [
    t("(−) Custos administrativos", "rotulo"),
    f("AdminAno", caixa.admin, "moeda"),
  ];
  linhasCaixa[C_CONF + 2] = [
    t("= Para projetos", "totalTexto"),
    f(`B${C_CONF + 1}-B${C_CONF + 2}`, receita - caixa.admin, "total"),
  ];
  if (d.tetoSistema !== null) {
    linhasCaixa[C_CONF + 3] = [
      t("Teto registrado no sistema", "rotulo"),
      t(d.tetoSistema, "moeda"),
    ];
    linhasCaixa[C_CONF + 4] = [
      t("Diferença", "rotulo"),
      f(
        `B${C_CONF + 3}-B${C_CONF + 4}`,
        receita - caixa.admin - d.tetoSistema,
        "moeda",
      ),
    ];
  }

  const abaCaixa = {
    nome: ABA.caixa,
    cor: "07B4E7",
    linhas: Array.from(linhasCaixa, (l) => l ?? []),
    larguras: [36, 19, ...MESES.map(() => 12)],
    alturas: { 1: 24, 2: 30 },
    mesclar: [
      "A1:N1",
      "A2:N2",
      `C${C_REC_SIS}:N${C_REC_SIS}`,
      `C${C_SALDO_INI}:N${C_SALDO_INI}`,
    ],
    congelar: 4,
    congelarColunas: 2,
    paisagem: true,
    rodape,
    alertas: [
      {
        ref: `C${C_REC}:N${C_ADM}`,
        formula: `ISBLANK(C${C_REC_DIG})`,
        dxf: "padrao" as const,
      },
      {
        ref: `B${C_SALDO}:N${C_ACUM}`,
        formula: `B${C_SALDO}<-0.5`,
        dxf: "alerta" as const,
      },
    ],
    validacoes: [
      {
        ref: `C${C_REC_DIG}:N${C_ADM_DIG} B${C_REC_SIS}`,
        min: 0,
        titulo: "Valor em reais",
        dica: "Digite o valor. Em branco vale o padrão (itálico na linha do fluxo).",
        erro: "Digite um valor em reais, zero ou positivo.",
      },
    ],
  };

  // =============================================================== Envelopes
  const linhasEnv: Celula[][] = [
    [t(`Envelopes no ano · Remessa ${d.ano}`, "titulo")],
    [
      t(
        "Limite = receita × percentual (o administrativo é uma das seis fatias). Proposta = soma da aba Projetos pelo envelope; a do administrativo vem do Caixa. Mude o percentual na coluna Diretriz.",
        "subtitulo",
      ),
    ],
    [],
    [
      t("Envelope", "cabecalho"),
      t("Nome", "cabecalho"),
      t("Diretriz ✎", "cabecalhoN"),
      t("Diretriz da reunião", "cabecalhoN"),
      t("Limite", "cabecalhoN"),
      t("Projetos", "cabecalhoN"),
      t("Pedido", "cabecalhoN"),
      t("Proposta", "cabecalhoN"),
      t("% da receita", "cabecalhoN"),
      t("Saldo", "cabecalhoN"),
      t("Situação", "cabecalho"),
      t("O que entra", "cabecalho"),
    ],
  ];
  const situacao = (saldo: number | null) =>
    saldo === null
      ? ""
      : saldo < -0.5
        ? "acima do limite"
        : saldo > 0.5
          ? "de folga"
          : "no limite";
  for (const e of ENVELOPES) {
    const r = linhaEnv(e.chave);
    const q = porChave.get(e.chave)!;
    const adm = e.chave === "administrativo";
    linhasEnv[r - 1] = [
      t(e.curto, "rotulo"),
      t(e.rotulo, "texto"),
      t(q.alvo, "entradaPct"),
      t(e.alvo, "pct"),
      f(`Receita*C${r}`, receita * q.alvo!, "moeda"),
      adm
        ? t(null, "texto")
        : f(`COUNTIFS(${CRIT},$A${r})`, q.projetos, "inteiro"),
      adm
        ? t(null, "texto")
        : f(`SUMIFS(${proj("H")},${CRIT},$A${r})`, q.pedido, "moeda"),
      adm
        ? f("AdminAno", q.proposta, "moeda")
        : f(`SUMIFS(${proj("I")},${CRIT},$A${r})`, q.proposta, "moeda"),
      f(
        `IF(Receita=0,0,H${r}/Receita)`,
        receita ? q.proposta / receita : 0,
        "pct",
      ),
      f(`E${r}-H${r}`, receita * q.alvo! - q.proposta, "moeda"),
      f(
        `IF(J${r}<-0.5,"acima do limite",IF(J${r}>0.5,"de folga","no limite"))`,
        situacao(receita * q.alvo! - q.proposta),
        "texto",
      ),
      t(
        adm ? "Custo da operação, lançado na aba Caixa." : e.criterio,
        "textoCinza",
      ),
    ];
  }
  if (temSem) {
    const q = porChave.get(null)!;
    linhasEnv[ESEM - 1] = [
      t(SEM_ENVELOPE, "rotulo"),
      t("Categoria sem envelope", "texto"),
      t(null, "texto"),
      t(null, "texto"),
      t(null, "texto"),
      f(`COUNTIFS(${CRIT},$A${ESEM})`, q.projetos, "inteiro"),
      f(`SUMIFS(${proj("H")},${CRIT},$A${ESEM})`, q.pedido, "moeda"),
      f(`SUMIFS(${proj("I")},${CRIT},$A${ESEM})`, q.proposta, "moeda"),
      f(
        `IF(Receita=0,0,H${ESEM}/Receita)`,
        receita ? q.proposta / receita : 0,
        "pct",
      ),
      t(null, "texto"),
      t("escolha um envelope", "texto"),
      t("A divisão não reserva nada para estes projetos.", "textoCinza"),
    ];
  }
  const somaAlvo = quadro.linhas.reduce((s, q) => s + (q.alvo ?? 0), 0);
  const tot = quadro.total;
  linhasEnv[ET - 1] = [
    t("Total", "totalTexto"),
    t("Projetos + administrativo", "totalTexto"),
    f(`SUM(C${E0}:C${EADM})`, somaAlvo, "totalPct"),
    f(`SUM(D${E0}:D${EADM})`, 1, "totalPct"),
    f("Receita", receita, "total"),
    f(`SUM(F${E0}:F${ET - 1})`, tot.projetos, "totalMes"),
    f(`SUM(G${E0}:G${ET - 1})`, tot.pedido, "total"),
    f(`SUM(H${E0}:H${ET - 1})`, tot.proposta, "total"),
    f(
      `IF(Receita=0,0,H${ET}/Receita)`,
      receita ? tot.proposta / receita : 0,
      "totalPct",
    ),
    f(`E${ET}-H${ET}`, receita - tot.proposta, "total"),
    f(
      `IF(ABS(C${ET}-1)>0.0005,"a diretriz não soma 100%","")`,
      Math.abs(somaAlvo - 1) > 0.0005 ? "a diretriz não soma 100%" : "",
      "totalTexto",
    ),
    t(null, "totalTexto"),
  ];
  linhasEnv[ET + 1] = [
    t(
      "Base: projetos avaliáveis (rejeitado, rascunho e cancelado ficam fora). Saúde e “outros” entram em Missões; nenhum projeto vai para a oferta de misericórdia sem decisão da mesa. Decisão “reprovado”, “adiado” ou “devolvido” na pasta tira o projeto da proposta.",
      "subtitulo",
    ),
  ];

  const abaEnvelopes = {
    nome: ABA.envelopes,
    cor: "A1C520",
    linhas: Array.from(linhasEnv, (l) => l ?? []),
    larguras: [16, 32, 11, 11, 17, 10, 17, 17, 10, 17, 25, 70],
    alturas: { 1: 24, 2: 30, 4: 30, [ET + 2]: 30 },
    mesclar: ["A1:L1", "A2:L2", `A${ET + 2}:L${ET + 2}`],
    congelar: 4,
    congelarColunas: 1,
    paisagem: true,
    rodape,
    alertas: [
      {
        ref: `C${E0}:C${EADM}`,
        formula: `ROUND(C${E0}-D${E0},6)<>0`,
        dxf: "ajustado" as const,
      },
      {
        ref: `J${E0}:J${ET}`,
        formula: `AND(ISNUMBER(J${E0}),J${E0}<-0.5)`,
        dxf: "alerta" as const,
      },
      {
        ref: `J${E0}:J${ET}`,
        formula: `AND(ISNUMBER(J${E0}),J${E0}>0.5)`,
        dxf: "folga" as const,
      },
      {
        ref: `K${E0}:K${ET - 1}`,
        formula: `$K${E0}="acima do limite"`,
        dxf: "alerta" as const,
      },
      {
        ref: `C${ET} K${ET}`,
        formula: `ABS($C${ET}-1)>0.0005`,
        dxf: "alerta" as const,
      },
    ],
    validacoes: [
      {
        ref: `C${E0}:C${EADM}`,
        min: 0,
        max: 1,
        titulo: "Percentual da receita",
        dica: "Digite o percentual (ex.: 50%). Limite, saldo e a reserva do administrativo recalculam. A soma deve dar 100%.",
        erro: "Use um percentual entre 0% e 100%.",
      },
    ],
  };

  // ================================================================= Leia-me
  const estouram = quadro.linhas.filter(
    (q) => q.envelope && q.saldo !== null && q.saldo < -0.5,
  ).length;
  const negativos = fx.saldoMes.filter((v) => v < -0.5).length;
  const envRef = (c: string) => `${refAba(ABA.envelopes)}!${c}`;
  const L_SIT = 5;
  const linhasLeia: Celula[][] = [
    [t("Hebron ASEEC · Envelopes da diretriz", "titulo")],
    [
      t(
        `Remessa ${d.ano} · exportado do painel em ${d.geradoEm} · documento de trabalho, sujeito à consolidação`,
        "subtitulo",
      ),
    ],
    [],
    [
      t("Situação agora (recalcula com o que você mudar)", "faixa"),
      t(null, "faixa"),
      t(null, "faixa"),
    ],
    [
      t("Receita (base dos percentuais)", "texto"),
      f("Receita", receita, "destaque"),
    ],
    [
      t("Proposta (projetos + administrativo)", "texto"),
      f(envRef(`H${ET}`), tot.proposta, "destaque"),
    ],
    [
      t("Saldo no ano (receita − proposta)", "texto"),
      f(envRef(`J${ET}`), receita - tot.proposta, "destaque"),
    ],
    [
      t("Envelopes acima do limite", "texto"),
      f(
        `COUNTIF(${envRef(`J${E0}:J${EADM}`)},"<-0.5")`,
        estouram,
        "destaqueInteiro",
      ),
    ],
    [
      t("Meses com caixa negativo", "texto"),
      f(
        `COUNTIF(${refAba(ABA.caixa)}!C${C_SALDO}:N${C_SALDO},"<-0.5")`,
        negativos,
        "destaqueInteiro",
      ),
    ],
    [
      t("A diretriz soma", "texto"),
      f(envRef(`C${ET}`), somaAlvo, "destaquePct"),
    ],
    [],
    [t("Legenda", "faixa"), t(null, "faixa"), t(null, "faixa")],
    [
      t("Editável", "texto"),
      t(1000, "entradaMoeda"),
      t(
        "Célula azul-clara com borda: digite aqui. Em branco volta ao valor padrão.",
        "texto",
      ),
    ],
    [
      t("Calculado", "texto"),
      t(1000, "moeda"),
      t("Fórmula: não digite por cima.", "texto"),
    ],
    [
      t("Alerta", "texto"),
      t(1000, "moeda"),
      t(
        "Acima do limite, mês negativo, diretriz fora de 100% ou envelope fora da lista.",
        "texto",
      ),
    ],
    [
      t("Ajustado", "texto"),
      t(1000, "mes"),
      t(
        "Diferente do pedido (parcela) ou da diretriz da reunião (percentual).",
        "texto",
      ),
    ],
    [
      t("Padrão", "texto"),
      t(1000, "mes"),
      t(
        "Valor padrão, ainda não digitado (receita do sistema ÷ 12; administrativo = percentual da receita).",
        "texto",
      ),
    ],
    [
      t("Fora da proposta", "texto"),
      t(1000, "cinzaMoeda"),
      t(
        "A pasta do projeto reprovou, adiou ou devolveu: a proposta é zero.",
        "texto",
      ),
    ],
    [],
    [t("Como usar", "faixa"), t(null, "faixa"), t(null, "faixa")],
    ...[
      "1. Percentuais: aba Envelopes, coluna Diretriz. O limite de cada envelope é a receita × o percentual, e a reserva do administrativo acompanha o percentual dele.",
      "2. Envelope de um projeto: aba Projetos, coluna Envelope (lista). Envelopes e Caixa somam por essa coluna, na hora.",
      "3. Parcelas: aba Projetos, colunas jan a dez. A Proposta é a soma dos meses. O pedido original está nas colunas recolhidas à direita (botão + no topo).",
      "4. Receita e custos administrativos: aba Caixa, linhas “digitada”. Em branco vale o padrão.",
      "5. Filtrar ou ordenar a aba Projetos não muda as contas: Caixa e Envelopes somam a remessa inteira. A linha de soma no topo da aba segue o filtro.",
      "6. Nada desta planilha volta ao painel. É simulação: o que vale é o gravado na tela Envelopes.",
    ].map((s) => [t(s, "textoQuebra")]),
    [],
    [t("Regras da exportação", "faixa"), t(null, "faixa"), t(null, "faixa")],
    ...[
      "Proposta: decisão da pasta reprovado/adiado/devolvido zera › ajuste da mesa › valor da decisão da pasta › aprovado no sistema › pedido.",
      "Envelope: mesa › avaliação do conteúdo › categoria. Saúde e “outros” entram em Missões; nenhum projeto vai para a misericórdia sem decisão da mesa.",
      "Base: projetos avaliáveis (rejeitado, rascunho e cancelado ficam fora). Pedido sem meses informados foi dividido em 12.",
    ].map((s) => [t(s, "textoQuebra")]),
  ];
  const L_USO = 21;
  const L_REGRAS = L_USO + 8;
  const mesclasTexto = [
    ...Array.from({ length: 6 }, (_, i) => `A${L_USO + i}:C${L_USO + i}`),
    ...Array.from({ length: 3 }, (_, i) => `A${L_REGRAS + i}:C${L_REGRAS + i}`),
  ];
  const alturasTexto = Object.fromEntries(
    [
      ...Array.from({ length: 6 }, (_, i) => L_USO + i),
      ...Array.from({ length: 3 }, (_, i) => L_REGRAS + i),
    ].map((r) => [r, 30]),
  );

  const abaLeia = {
    nome: ABA.leia,
    cor: "202C85",
    semGrade: true,
    linhas: linhasLeia,
    larguras: [38, 26, 90],
    // O número em destaque (14 pt) não cabe na linha padrão.
    alturas: {
      1: 26,
      ...alturasTexto,
      ...Object.fromEntries([0, 1, 2, 3, 4, 5].map((i) => [L_SIT + i, 20])),
    },
    mesclar: [
      "A1:C1",
      "A2:C2",
      "A4:C4",
      "A12:C12",
      "A20:C20",
      `A${L_REGRAS - 1}:C${L_REGRAS - 1}`,
      ...mesclasTexto,
    ],
    rodape,
    alertas: [
      { ref: "B7", formula: "B7<-0.5", dxf: "alerta" as const },
      { ref: "B8:B9", formula: "B8>0", dxf: "alerta" as const },
      { ref: "B10", formula: "ABS(B10-1)>0.0005", dxf: "alerta" as const },
      { ref: "B15", formula: "TRUE", dxf: "alerta" as const },
      { ref: "B16", formula: "TRUE", dxf: "ajustado" as const },
      { ref: "B17", formula: "TRUE", dxf: "padrao" as const },
    ],
  };

  return pasta([abaLeia, abaCaixa, abaEnvelopes, abaProjetos], nomes);
}
