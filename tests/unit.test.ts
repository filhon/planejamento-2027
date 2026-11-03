/**
 * Testes das regras puras da fundação de dados — não tocam no banco.
 *   npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { assertReadOnly, ReadOnlyViolationError } from "../src/lib/db";
import { embedDrive, rotuloDrive } from "../src/lib/drive";
import {
  deltaPedido,
  plural,
  setaVariacao,
  variacaoPedido,
} from "../app/(painel)/formato";
import { construirIndicePaises, normalizarLocal } from "../src/lib/geo";
import {
  escolherLinhaOrcamento,
  estatisticaNota,
  grupoDeStatus,
  agregarPorPais,
  montarConformidade,
} from "../src/lib/datasets";
import {
  agregarPorInstituicao,
  alternar,
  avaliavel,
  casaBusca,
  curvaAcumulada,
  ehConveniada,
  filtrar,
  montarCobertura,
  montarPastas,
  montarRenovacoes,
  projetosAte,
  SEM_FILTRO,
  SEM_RESPONSAVEL,
  temFiltro,
  vaiParaPasta,
  type Filtros,
} from "../src/lib/agregar";
import { carregarCountryMap } from "../src/lib/enrichment";
import { ehHtmlRico, sanitizarHtml } from "../src/lib/html";
import { geometriaMundo } from "../src/lib/mapa";
import {
  GRUPO_SENSIVEL,
  SEM_REVISAO,
  type ProjetoCiclo,
  type RelatorioPrestacao,
} from "../src/lib/types";
import {
  LIMIAR,
  distribuir,
  normalizarTitulo,
  reequilibrar,
  similaridadeTitulo,
  sugerirVinculo,
} from "../src/lib/recorrencia";
import {
  FORA_DA_DIRETRIZ,
  montarDiretriz,
  rotuloRubrica,
} from "../src/lib/rubricas";
import { crc32, planilha } from "../src/lib/xlsx";
import { lerXlsx } from "../src/lib/xlsx-ler";
import { deflateRawSync } from "node:zlib";
import type { DocumentoRow, OrcamentoRow } from "../src/lib/queries";

const indice = construirIndicePaises(carregarCountryMap());

// ------------------------------------------------------- guarda de leitura

test("guarda bloqueia escrita e libera leitura", () => {
  for (const sql of [
    "insert into cycle_projects (id) values ('x')",
    "update cycle_projects set title = 'x'",
    "delete from cycle_projects",
    "create view vw_x as select 1",
    "alter table cycle_projects add column x int",
    "select 1; drop table cycle_projects",
    "SELECT 1; TRUNCATE cycle_projects",
  ]) {
    assert.throws(
      () => assertReadOnly(sql),
      ReadOnlyViolationError,
      `deveria bloquear: ${sql}`,
    );
  }

  assert.doesNotThrow(() => assertReadOnly("select 1"));
  assert.doesNotThrow(() =>
    assertReadOnly("with x as (select 1) select * from x"),
  );
  // 'delete' dentro de literal/comentário não pode derrubar um SELECT legítimo
  assert.doesNotThrow(() =>
    assertReadOnly("select 'delete' as acao -- update aqui é comentário"),
  );
});

// --------------------------------------------------- normalização de país

test("país declarado casa com o de-para, com e sem acento", () => {
  const mocambique = normalizarLocal({ country: "Moçambique" }, indice);
  assert.equal(mocambique.iso3, "MOZ");
  assert.equal(mocambique.continente, "África");
  assert.equal(mocambique.fonte, "country");
  assert.equal(mocambique.sensivel, false);

  assert.equal(
    normalizarLocal({ country: "  mocambique " }, indice).iso3,
    "MOZ",
  );
  assert.equal(normalizarLocal({ country: "BRASIL" }, indice).iso3, "BRA");
});

test("'Outro' resgata o país quando state/city aponta um único país", () => {
  const tadjiquistao = normalizarLocal(
    { country: "Outro", state: "Dushanbe, Tadjiquistão", city: "Dushanbe" },
    indice,
  );
  assert.equal(tadjiquistao.iso3, "TJK");
  assert.equal(tadjiquistao.fonte, "state");

  const camboja = normalizarLocal(
    { country: "Outro", state: null, city: "Phnom Penh, Camboja" },
    indice,
  );
  assert.equal(camboja.iso3, "KHM");
  assert.equal(camboja.fonte, "city");
});

test("'Outro' com região multi-país fica em Multi-país / sensível", () => {
  for (const entrada of [
    { country: "Outro", state: null, city: "África Subsaariana" },
    {
      country: "Outro",
      state: "Oriente Médio e Índia",
      city: "Beirut, Damasco, Calcutá",
    },
    {
      country: "Outro",
      state: null,
      city: "Ásia, Oriente Médio, Norte da África e Amazônia",
    },
    { country: "Outro", state: null, city: null },
  ]) {
    const local = normalizarLocal(entrada, indice);
    assert.equal(
      local.iso3,
      null,
      `deveria virar sensível: ${entrada.city ?? entrada.state}`,
    );
    assert.equal(local.nomePt, GRUPO_SENSIVEL);
    assert.equal(local.sensivel, true);
  }
});

test("Níger não é confundido com Nigéria (limite de palavra)", () => {
  assert.equal(
    normalizarLocal(
      { country: "Outro", state: "Níger", city: "Niamey" },
      indice,
    ).iso3,
    "NER",
  );
  assert.equal(normalizarLocal({ country: "Nigéria" }, indice).iso3, "NGA");
});

test("país fora do de-para é sinalizado, não inventado", () => {
  const local = normalizarLocal({ country: "Freedônia" }, indice);
  assert.equal(local.iso3, null);
  assert.equal(local.continente, "Não mapeado");
  assert.equal(local.sensivel, false);
});

// ------------------------------------------------------------- orçamento

const linha = (p: Partial<OrcamentoRow>): OrcamentoRow => ({
  id: p.id ?? "x",
  year: p.year ?? 2025,
  status: p.status ?? "confirmado",
  faturamento: p.faturamento ?? null,
  porcentagem_doacao: null,
  margem_seguranca: null,
  custos_administrativos: null,
  ofertas_aprovadas: null,
  valor_ministerio_saude: null,
  total_conveniados: p.total_conveniados ?? 0,
  total_nao_conveniados: p.total_nao_conveniados ?? 0,
  updated_at: null,
});

test("2025: linhas 'confirmado' de teste são descartadas e a real (rascunho) vence", () => {
  const rows = [
    linha({
      id: "t1",
      status: "confirmado",
      total_conveniados: 3,
      total_nao_conveniados: 2,
    }),
    linha({
      id: "t2",
      status: "confirmado",
      total_conveniados: 60,
      total_nao_conveniados: 34,
    }),
    linha({
      id: "real",
      status: "rascunho",
      total_conveniados: 6_794_000,
      total_nao_conveniados: 10_026_977.86,
    }),
  ];
  const escolha = escolherLinhaOrcamento(rows, 2025);
  assert.equal(escolha.linha?.id, "real");
  assert.ok(escolha.alertas.some((a) => a.includes("implausível")));
  assert.ok(escolha.alertas.some((a) => a.includes("confirmar com a equipe")));
});

test("2026: 'confirmado' plausível vence sem alerta de critério", () => {
  const rows = [
    linha({
      id: "ok",
      year: 2026,
      total_conveniados: 0,
      total_nao_conveniados: 14_500_000,
    }),
  ];
  const escolha = escolherLinhaOrcamento(rows, 2026);
  assert.equal(escolha.linha?.id, "ok");
  assert.equal(escolha.criterio, "status=confirmado com teto plausível");
});

test("ano sem linha de orçamento não quebra", () => {
  const escolha = escolherLinhaOrcamento([], 2027);
  assert.equal(escolha.linha, null);
  assert.ok(escolha.alertas.length > 0);
});

// ---------------------------------------------------------- estatísticas

test("estatística de nota expõe mediana, quartis e a inflação de 10,0", () => {
  const e = estatisticaNota([10, 10, 10, 8, 6]);
  assert.equal(e.n, 5);
  assert.equal(e.mediana, 10);
  assert.equal(e.min, 6);
  assert.equal(e.max, 10);
  assert.equal(e.fracaoNotaMaxima, 0.6);
  assert.ok((e.desvio ?? 0) > 0);

  const vazia = estatisticaNota([]);
  assert.equal(vazia.n, 0);
  assert.equal(vazia.mediana, null);
});

test("status vira grupo semântico da paleta", () => {
  assert.equal(grupoDeStatus("aprovado"), "aprovado");
  assert.equal(grupoDeStatus("em-validacao"), "em-avaliacao");
  assert.equal(grupoDeStatus("devolvido-para-correcao"), "neutro");
  assert.equal(grupoDeStatus("status-que-nao-existe"), "neutro");
});

// --------------------------------------------------------- agregação país

const projeto = (p: Partial<ProjetoCiclo>): ProjetoCiclo =>
  ({
    id: "p",
    titulo: "Projeto",
    categoria: "educacao",
    solicitado: 0,
    aprovado: 0,
    reservado: 0,
    liberado: 0,
    notaMediana: null,
    instituicaoId: "i1",
    instituicaoNome: "Instituição 1",
    status: "em-validacao",
    statusGrupo: "em-avaliacao",
    conveniada: null,
    local: normalizarLocal({ country: "Brasil" }, indice),
    enriquecimento: {
      parceriaDesdeAno: null,
      anosDeParceria: null,
      tipoParceria: null,
      observacoesAvaliacao: null,
      situacaoNoSistema: null,
      valorAprovado2025: null,
      projetos2025: null,
      projetos2026: null,
    },
    revisao: SEM_REVISAO,
    analise: {
      temParecer: false,
      tags: [],
      temDevolutiva: false,
      analisado: false,
      atualizadoEm: null,
    },
    ...p,
  }) as ProjetoCiclo;

/** Projeto com triagem — atalho para os testes da Fase 5. */
const triado = (
  id: string,
  r: Partial<ProjetoCiclo["revisao"]>,
  extra: Partial<ProjetoCiclo> = {},
): ProjetoCiclo => projeto({ id, ...extra, revisao: { ...SEM_REVISAO, ...r } });

test("agregação por país soma valores e conta instituições distintas", () => {
  const locais = agregarPorPais([
    projeto({ id: "a", solicitado: 100, aprovado: 50, instituicaoId: "i1" }),
    projeto({
      id: "b",
      solicitado: 200,
      aprovado: 0,
      instituicaoId: "i1",
      categoria: "saude",
    }),
    projeto({
      id: "c",
      solicitado: 10,
      instituicaoId: "i2",
      local: normalizarLocal({ country: "Angola" }, indice),
    }),
  ]);

  const brasil = locais.find((l) => l.iso3 === "BRA");
  assert.equal(brasil?.projetos, 2);
  assert.equal(brasil?.solicitado, 300);
  assert.equal(brasil?.aprovado, 50);
  assert.equal(brasil?.instituicoes, 1);
  assert.equal(brasil?.categorias.length, 2);
  assert.equal(locais[0]?.iso3, "BRA", "deve vir ordenado por nº de projetos");
});

// ------------------------------------------------------- filtros (Fase 3)

test("filtros globais se combinam dentro do eixo e entre eixos", () => {
  const angola = normalizarLocal({ country: "Angola" }, indice);
  const universo = [
    projeto({ id: "a", status: "aprovado", estado: "PE" }),
    projeto({
      id: "b",
      status: "aprovado",
      categoria: "saude",
      estado: "pe",
    }),
    projeto({ id: "c", status: "concluido", estado: "Pernambuco" }),
    projeto({
      id: "d",
      status: "rejeitado",
      categoria: "saude",
      local: angola,
    }),
    // Mesmo grupo da paleta ("neutro"), status diferentes: o filtro separa.
    projeto({ id: "e", status: "rascunho", statusGrupo: "neutro" }),
    projeto({
      id: "f",
      status: "devolvido-para-correcao",
      statusGrupo: "neutro",
    }),
  ];

  const ids = (f: Partial<Filtros>) =>
    filtrar(universo, { ...SEM_FILTRO, ...f }).map((p) => p.id);

  assert.deepEqual(
    ids({}),
    ["a", "b", "c", "d", "e", "f"],
    "sem filtro não recorta",
  );
  assert.deepEqual(ids({ status: ["aprovado"] }), ["a", "b"]);
  assert.deepEqual(
    ids({ status: ["devolvido-para-correcao"] }),
    ["f"],
    "status é o da origem, não o grupo: devolvido não traz o rascunho",
  );
  assert.deepEqual(ids({ iso3: "AGO" }), ["d"]);
  // UF casa por `ufDe`: sigla em qualquer caixa e nome por extenso.
  assert.deepEqual(ids({ uf: "PE" }), ["a", "b", "c"]);
  assert.deepEqual(ids({ uf: "PE", status: ["aprovado"] }), ["a", "b"]);
  assert.deepEqual(ids({ categoria: ["saude"], status: ["aprovado"] }), ["b"]);
  assert.deepEqual(ids({ continente: ["África"], categoria: ["saude"] }), [
    "d",
  ]);

  // Multi-seleção: dentro do eixo soma (OU), entre eixos cruza (E).
  assert.deepEqual(
    ids({ status: ["aprovado", "rejeitado"] }),
    ["a", "b", "d"],
    "dois status somam",
  );
  assert.deepEqual(
    ids({ status: ["aprovado", "rejeitado"], categoria: ["saude"] }),
    ["b", "d"],
    "os eixos continuam se cruzando",
  );
  assert.deepEqual(ids({ continente: ["África", "Ásia"] }), ["d"]);

  assert.deepEqual(alternar([], "x"), ["x"]);
  assert.deepEqual(alternar(["x"], "y"), ["x", "y"]);
  assert.deepEqual(alternar(["x", "y"], "x"), ["y"]);

  assert.equal(temFiltro(SEM_FILTRO), false);
  assert.equal(temFiltro({ ...SEM_FILTRO, iso3: "BRA" }), true);
  assert.equal(temFiltro({ ...SEM_FILTRO, status: ["aprovado"] }), true);
});

/**
 * O convênio deixou de ser eixo de filtro (o de Instituição faz melhor), mas a
 * regra continua valendo no Orçamento: quem não é conveniada disputa o teto das
 * NÃO conveniadas — e `null` cai desse lado.
 */
test("null conta como não conveniada", () => {
  assert.equal(ehConveniada(projeto({ conveniada: true })), true);
  assert.equal(ehConveniada(projeto({ conveniada: false })), false);
  assert.equal(ehConveniada(projeto({ conveniada: null })), false);
});

test("filtro por instituição isola a organização", () => {
  const universo = [
    projeto({ id: "a", instituicaoNome: "Missão Vida Internacional" }),
    projeto({
      id: "b",
      instituicaoNome: "Missão Vida Internacional",
      status: "aprovado",
    }),
    projeto({ id: "c", instituicaoNome: "Associação Boa Semente" }),
    projeto({ id: "d", instituicaoNome: null }),
  ];
  const ids = (f: Partial<Filtros>) =>
    filtrar(universo, { ...SEM_FILTRO, ...f }).map((p) => p.id);

  assert.deepEqual(ids({ instituicao: ["Missão Vida Internacional"] }), [
    "a",
    "b",
  ]);
  assert.deepEqual(
    ids({
      instituicao: ["Missão Vida Internacional", "Associação Boa Semente"],
    }),
    ["a", "b", "c"],
    "duas instituições somam",
  );
  assert.deepEqual(
    ids({
      instituicao: ["Missão Vida Internacional"],
      status: ["aprovado"],
    }),
    ["b"],
    "status é outro eixo, e cruza",
  );
  assert.deepEqual(
    ids({ instituicao: ["Associação Boa Semente"] }),
    ["c"],
    "projeto sem instituição não entra em recorte de instituição",
  );
  assert.ok(temFiltro({ ...SEM_FILTRO, instituicao: ["x"] }));
});

// -------------------------------------------------- texto rico da origem

test("o parecer em HTML é desenhado, e só com as tags da lista", () => {
  // A forma real de um parecer da origem (medida: p, strong, br, span, li, ol).
  assert.equal(
    sanitizarHtml(
      "<p>Projeto bem estruturado.</p><p><br></p><p><strong>Score: 70/100</strong>.</p>",
    ),
    "<p>Projeto bem estruturado.</p><p><strong>Score: 70/100</strong>.</p>",
    "linha em branco do editor não vira vão de três linhas",
  );
  assert.equal(
    sanitizarHtml("<ol><li>Carta de recomendação</li><li>Relatório</li></ol>"),
    "<ol><li>Carta de recomendação</li><li>Relatório</li></ol>",
  );
  // span não formata nada sem atributo: some, o texto fica.
  assert.equal(sanitizarHtml('<span style="color:red">Texto</span>'), "Texto");
  assert.equal(
    sanitizarHtml("Bolsa &amp; auxílio&nbsp;mensal"),
    "Bolsa &amp; auxílio&nbsp;mensal",
  );

  // Fronteira de confiança: o parecer é escrito noutro sistema.
  assert.equal(
    sanitizarHtml("<script>alert(1)</script>"),
    "",
    "corpo do script vai junto",
  );
  assert.equal(sanitizarHtml("<style>body{display:none}</style>"), "");
  assert.equal(sanitizarHtml('<img src=x onerror="alert(1)">'), "");
  assert.equal(
    sanitizarHtml('<a href="javascript:alert(1)">clique</a>'),
    "clique",
  );
  assert.equal(
    sanitizarHtml('<p onclick="alert(1)" style="x">oi</p>'),
    "<p>oi</p>",
    "a tag passa, os atributos não",
  );
  assert.equal(sanitizarHtml("<iframe src=//mau></iframe>"), "");
  assert.equal(sanitizarHtml("<!-- comentário -->texto"), "texto");
  assert.ok(
    !sanitizarHtml("<scr<script>ipt>alert(1)</script>").includes("ipt>"),
  );
  // Apagar a tag do meio não pode remontar uma tag nova.
  assert.equal(
    sanitizarHtml("<<span>img src=x onerror=alert(1)>"),
    "&lt;img src=x onerror=alert(1)&gt;",
  );
  assert.ok(
    !/<img/i.test(sanitizarHtml('<img alt=">" src=x onerror=alert(1)>')),
  );

  // Texto puro continua no caminho do React, que escapa sozinho.
  assert.equal(ehHtmlRico("Orçamento de R$ 5 < R$ 10 para M&M"), false);
  assert.equal(ehHtmlRico("Projeto sem formatação nenhuma."), false);
  assert.equal(ehHtmlRico("<p>Com formatação</p>"), true);
  assert.equal(ehHtmlRico("linha 1<br>linha 2"), true);
});

test("busca da lista casa por trecho do nome e por iniciais", () => {
  const mvi = "Missão Vida Internacional";
  assert.ok(casaBusca(mvi, ""), "sem termo, tudo passa");
  assert.ok(casaBusca(mvi, "vida"));
  assert.ok(casaBusca(mvi, "VIDA INTERN"), "caixa e espaço não importam");
  assert.ok(casaBusca(mvi, "missao"), "acento do nome não atrapalha");
  assert.ok(casaBusca(mvi, "Missão"), "acento digitado também não");
  assert.ok(casaBusca(mvi, "mvi"), "iniciais");
  assert.ok(casaBusca(mvi, "M.V.I."), "iniciais com pontuação");
  assert.ok(!casaBusca(mvi, "semente"));
  assert.ok(!casaBusca(mvi, "abs"), "iniciais de outra instituição");

  // Conectivo não conta nas iniciais: ninguém digita "MEDA".
  assert.ok(casaBusca("Missão Evangélica da Amazônia", "mea"));
  // ...e continua achando pelo nome inteiro.
  assert.ok(casaBusca("Missão Evangélica da Amazônia", "evangelica da"));
});

// ------------------------------------------------- instituições (Fase 4)

test("agregação por instituição soma verba, conta países e junta os documentos", () => {
  const docs = {
    i1: { enviados: 5, pendentes: 0, total: 5 },
    i2: { enviados: 2, pendentes: 3, total: 5 },
  };
  const lista = agregarPorInstituicao(
    [
      projeto({
        id: "a",
        instituicaoId: "i1",
        instituicaoNome: "Alfa",
        conveniada: true,
        solicitado: 100,
        aprovado: 90,
      }),
      projeto({
        id: "b",
        instituicaoId: "i1",
        instituicaoNome: "Alfa",
        conveniada: true,
        solicitado: 50,
        aprovado: 10,
        local: normalizarLocal({ country: "Angola" }, indice),
      }),
      projeto({
        id: "c",
        instituicaoId: "i2",
        instituicaoNome: "Beta",
        conveniada: null,
        solicitado: 400,
        aprovado: 0,
      }),
    ],
    docs,
  );

  const alfa = lista.find((i) => i.id === "i1")!;
  assert.equal(alfa.projetos, 2);
  assert.equal(alfa.aprovado, 100);
  assert.equal(alfa.paises, 2);
  assert.equal(alfa.conveniada, true);
  assert.equal(alfa.documentos.pendentes, 0);

  // is_conveniada nulo NÃO é conveniada — mesma regra do resto do painel.
  const beta = lista.find((i) => i.id === "i2")!;
  assert.equal(beta.conveniada, false);
  assert.equal(beta.documentos.pendentes, 3);

  // Ordena por verba aprovada, mesmo quem pediu mais ficando atrás.
  assert.equal(lista[0]?.id, "i1");

  // Instituição sem linha em institution_documents não quebra o lookup.
  const semDocs = agregarPorInstituicao([projeto({ instituicaoId: "i9" })]);
  assert.equal(semDocs[0]?.documentos.total, 0);
});

test("conformidade separa enviados de pendentes por instituição e por tipo", () => {
  const rows: DocumentoRow[] = [
    {
      institution_id: "i1",
      document_type: "estatuto",
      status: "enviado",
      n: 1,
    },
    {
      institution_id: "i1",
      document_type: "cartao_cnpj",
      status: "pendente",
      n: 1,
    },
    {
      institution_id: "i2",
      document_type: "estatuto",
      status: "enviado",
      n: 1,
    },
  ];
  const c = montarConformidade(rows);

  assert.deepEqual(c.porInstituicao["i1"], {
    enviados: 1,
    pendentes: 1,
    total: 2,
  });
  assert.equal(c.tiposExigidos, 2);
  // O tipo com mais pendências vem primeiro — é o que a reunião precisa ver.
  assert.equal(c.porTipo[0]?.tipo, "cartao_cnpj");
  assert.equal(c.porTipo.find((t) => t.tipo === "estatuto")?.enviados, 2);
});

// ------------------------------------------- prestação de contas (Fase 4)

const relatorio = (r: Partial<RelatorioPrestacao>): RelatorioPrestacao => ({
  projetoId: r.projetoId ?? "a",
  instituicaoId: r.instituicaoId ?? "i1",
  ano: r.ano ?? 2026,
  trimestre: r.trimestre ?? 2,
  status: r.status ?? "enviado",
  enviadoEm: null,
  cicloAno: r.cicloAno ?? 2025,
});

test("cobertura conta só os financiados do recorte e separa o que não é cobertura", () => {
  const projetos = [
    projeto({ id: "a", statusGrupo: "aprovado", aprovado: 1000 }),
    projeto({ id: "b", statusGrupo: "aprovado", aprovado: 500 }),
    projeto({ id: "c", statusGrupo: "encerrado", aprovado: 200 }),
    projeto({ id: "d", statusGrupo: "em-avaliacao", aprovado: 0 }),
  ];
  const relatorios = [
    relatorio({ projetoId: "a", trimestre: 1 }),
    relatorio({ projetoId: "a", trimestre: 2 }),
    relatorio({ projetoId: "c", trimestre: 2, status: "rascunho" }),
    // projeto que não é financiado: conta como relatório, não como cobertura
    relatorio({ projetoId: "d", trimestre: 2 }),
    // projeto de outro ciclo: nem entra, porque não está no recorte
    relatorio({ projetoId: "zzz" }),
  ];

  const c = montarCobertura(projetos, relatorios, 2025);
  assert.equal(c.financiados, 3);
  assert.equal(c.comRelatorio, 2, "a e c entregaram; b não");
  assert.equal(c.cobertura, 2 / 3);
  assert.equal(c.relatorios, 4, "o relatório do projeto de fora não entra");
  assert.equal(c.rascunhos, 1);
  assert.equal(c.relatoriosForaDoEsperado, 1);
  assert.equal(c.aprovadoDescoberto, 500);
  assert.equal(c.aprovadoCoberto, 1200);
  assert.deepEqual(
    c.pendentes.map((p) => p.id),
    ["b"],
  );
  assert.deepEqual(
    c.porTrimestre.map((t) => t.rotulo),
    ["T1/2026", "T2/2026"],
  );

  // Sob filtro, relatório de projeto fora do recorte não infla a contagem.
  const soB = montarCobertura([projetos[1]!], relatorios, 2025);
  assert.equal(soB.relatorios, 0);
  assert.equal(soB.financiados, 1);
  assert.equal(soB.cobertura, 0);
});

test("relatório carimbado com outro cycle_id ainda conta para o projeto", () => {
  // Caso real da origem: relatório do ciclo 2026 prestando contas de um projeto
  // aprovado na Remessa 2025. A remessa vem do PROJETO, não do cycle_id.
  const c = montarCobertura(
    [projeto({ id: "a", statusGrupo: "aprovado", aprovado: 1000 })],
    [relatorio({ projetoId: "a", cicloAno: 2026, trimestre: 3 })],
    2025,
  );
  assert.equal(c.comRelatorio, 1);
  assert.equal(c.cobertura, 1);
  assert.equal(c.relatoriosDeOutroCiclo, 1, "o desencontro fica sinalizado");
  assert.equal(c.aprovadoDescoberto, 0);
});

test("ciclo sem projeto financiado não divide por zero", () => {
  const c = montarCobertura(
    [projeto({ id: "x", statusGrupo: "em-avaliacao" })],
    [],
    2026,
  );
  assert.equal(c.financiados, 0);
  assert.equal(c.cobertura, 0);
  assert.deepEqual(c.pendentes, []);
});

// ------------------------------------------------------------ mapa (Fase 2)

test("geometria do mundo casa com o de-para por ISO-3", () => {
  const paises = geometriaMundo();
  assert.ok(paises.length > 150, `poucos países no TopoJSON: ${paises.length}`);

  const comGeometria = new Set(paises.map((p) => p.iso3).filter(Boolean));
  const doDePara = new Set(carregarCountryMap().map((r) => r.iso3));
  const ausentes = [...doDePara].filter((i) => !comGeometria.has(i)).sort();

  // Natural Earth 110m não traz ilhas minúsculas; a UI mostra a ficha
  // "Fora do mapa" para elas. Se a lista crescer, a ficha cobre — mas o teste
  // avisa que a decisão precisa ser revista.
  assert.deepEqual(
    ausentes,
    ["CPV", "STP"],
    "mudou o conjunto de países sem geometria a 110m",
  );

  const brasil = paises.find((p) => p.iso3 === "BRA");
  assert.ok(brasil?.d.startsWith("M"), "path SVG do Brasil não foi gerado");
});

// ------------------------------------- triagem novo × renovação (Fase 5)

test("normalização de título tira acento, pontuação, ano e palavra vazia", () => {
  assert.equal(normalizarTitulo("Venha o Teu Reino"), "venha teu reino");
  assert.equal(normalizarTitulo("VENHA A TEU REINO"), "venha teu reino");
  assert.equal(normalizarTitulo("Boa Semente 2026"), "boa semente");
  assert.equal(normalizarTitulo("Boa Semente 2025"), "boa semente");
  // "Projeto" é palavra vazia aqui: metade dos títulos da base começa com ela.
  assert.equal(normalizarTitulo("Projeto Âncora"), "ancora");
});

test("similaridade reconhece renovação e rejeita projeto diferente", () => {
  assert.equal(similaridadeTitulo("Venha o Teu Reino", "VENHA A TEU REINO"), 1);

  // Plural e acréscimo de palavra continuam sendo o mesmo projeto.
  assert.ok(
    similaridadeTitulo("Projeto Parceiro Logos", "Projeto Parceiros Logos") >=
      LIMIAR.renovacao,
  );

  // Mesmo modelo de título, missionários diferentes: NÃO é renovação.
  assert.ok(
    similaridadeTitulo(
      "Sustento Família Maciel Corrêa",
      "Sustento Família Missionária - Valter, Luane e Estêvão Dias",
    ) < LIMIAR.renovacao,
  );

  // Projetos sem nada em comum ficam fora até da faixa de revisão.
  assert.ok(
    similaridadeTitulo(
      "Construção de Casas Missionárias",
      "Reforma dos quartos femininos",
    ) < LIMIAR.revisar,
  );
});

test("vínculo só casa dentro da mesma instituição", () => {
  const anteriores = [
    { id: "v1", titulo: "Projeto Âncora", instituicaoId: "i1", aprovado: 5000 },
    { id: "v2", titulo: "Projeto Âncora", instituicaoId: "i2", aprovado: 900 },
  ];

  const mesma = sugerirVinculo(
    { titulo: "Projeto Âncora", instituicaoId: "i1" },
    anteriores,
  );
  assert.equal(mesma.tipo, "renovacao");
  assert.equal(mesma.anteriorId, "v1");
  assert.equal(
    mesma.recebidoAnterior,
    5000,
    "pega o aprovado do projeto casado",
  );

  // Título idêntico em OUTRA instituição não é candidato — "Bolsa de Estudos"
  // existe em meia dúzia delas.
  const outra = sugerirVinculo(
    { titulo: "Projeto Âncora", instituicaoId: "i9" },
    anteriores,
  );
  assert.equal(outra.tipo, "novo");
  assert.equal(outra.anteriorId, null);

  // Projeto sem instituição não tem como casar.
  assert.equal(
    sugerirVinculo(
      { titulo: "Projeto Âncora", instituicaoId: null },
      anteriores,
    ).tipo,
    "novo",
  );
});

test("candidato plausível mas não conclusivo vira 'revisar', não renovação", () => {
  const s = sugerirVinculo(
    { titulo: "Cresce Criança Caruaru", instituicaoId: "i1" },
    [
      {
        id: "v1",
        titulo: "Cresce Criança Mirandiba",
        instituicaoId: "i1",
        aprovado: 100,
      },
    ],
  );
  assert.equal(s.tipo, "revisar", "outra cidade: a equipe é que decide");
  assert.equal(s.anteriorId, "v1", "mas o candidato fica à vista no CSV");
});

test("ruído abaixo da faixa de revisão não sugere candidato nenhum", () => {
  const s = sugerirVinculo(
    { titulo: "Construção de Casas Missionárias", instituicaoId: "i1" },
    [
      {
        id: "v1",
        titulo: "Reforma dos quartos femininos",
        instituicaoId: "i1",
        aprovado: 100,
      },
    ],
  );
  assert.equal(s.tipo, "novo");
  assert.equal(s.anteriorId, null, "não polui o CSV com casamento improvável");
  assert.ok(s.similaridade !== null, "mas registra a nota, para auditoria");
});

test("distribuição das pastas fica equilibrada e nunca reatribui", () => {
  const avaliadores = ["Ana", "Beto", "Caio"];

  const primeira = distribuir(["a", "b", "c", "d", "e", "f", "g"], avaliadores);
  const carga = new Map<string, number>();
  for (const nome of primeira.values()) {
    carga.set(nome, (carga.get(nome) ?? 0) + 1);
  }
  assert.deepEqual([...carga.values()].sort(), [2, 2, 3]);

  // Chegaram projetos novos no fim do mês: quem já tem pasta não a vê mudar,
  // e os que chegam vão para quem está mais leve.
  const segunda = distribuir(["h", "i"], avaliadores, carga);
  assert.equal(segunda.size, 2);
  for (const [id, nome] of primeira) {
    assert.equal(segunda.get(id), undefined, `${id} não foi redistribuído`);
    assert.equal(primeira.get(id), nome);
  }
  const cargaFinal = new Map(carga);
  for (const nome of segunda.values()) {
    cargaFinal.set(nome, (cargaFinal.get(nome) ?? 0) + 1);
  }
  assert.deepEqual([...cargaFinal.values()].sort(), [3, 3, 3]);

  // Sem avaliador ativo ninguém recebe — e o script avisa em vez de estourar.
  assert.equal(distribuir(["a"], []).size, 0);
});

test("reequilibrar nivela movendo o mínimo, sem tocar em quem está no ponto", () => {
  const avaliadores = ["Ana", "Beto", "Caio"];

  // Ana perdeu projetos (viraram renovação na revisão) e Dina acabou de entrar.
  const atribuicoes = [
    ...["a1", "a2"].map((id) => ({ id, responsavel: "Ana" })),
    ...["b1", "b2", "b3", "b4"].map((id) => ({ id, responsavel: "Beto" })),
    ...["c1", "c2", "c3"].map((id) => ({ id, responsavel: "Caio" })),
  ];

  const movidos = reequilibrar(atribuicoes, avaliadores);
  const final = new Map(atribuicoes.map((a) => [a.id, a.responsavel]));
  for (const [id, nome] of movidos) final.set(id, nome);

  const carga = (nome: string) =>
    [...final.values()].filter((v) => v === nome).length;
  assert.deepEqual([carga("Ana"), carga("Beto"), carga("Caio")], [3, 3, 3]);
  assert.equal(movidos.size, 1, "só um projeto precisa mudar de dono");
  // Caio já estava no teto: nada dele se mexe.
  for (const id of ["c1", "c2", "c3"]) assert.equal(final.get(id), "Caio");

  // Avaliador novo entra com zero e só empata aqui.
  const comDina = reequilibrar(atribuicoes, [...avaliadores, "Dina"]);
  const depois = new Map(atribuicoes.map((a) => [a.id, a.responsavel]));
  for (const [id, nome] of comDina) depois.set(id, nome);
  assert.equal(
    [...depois.values()].filter((v) => v === "Dina").length,
    2,
    "Dina recebe o excedente das pastas cheias",
  );

  // Já nivelado: não mexe em nada. E nome fora da lista não é redistribuído.
  assert.equal(reequilibrar(atribuicoes, avaliadores).size > 0, true);
  assert.equal(
    reequilibrar([{ id: "x", responsavel: "Gerente de fora" }], avaliadores)
      .size,
    0,
    "atribuição manual a quem não é avaliador fica de pé",
  );
});

test("filtros de triagem e de responsável cruzam com os demais", () => {
  const projetos = [
    triado("a", { tipo: "novo", responsavel: "Ana" }),
    triado("b", { tipo: "renovacao" }),
    triado("c", { tipo: "revisar", responsavel: "Beto" }),
    triado("d", { tipo: "novo" }),
  ];

  const f = (p: Partial<Filtros>): string[] =>
    filtrar(projetos, { ...SEM_FILTRO, ...p }).map((x) => x.id);

  assert.deepEqual(f({ tipo: ["novo"] }), ["a", "d"]);
  assert.deepEqual(f({ tipo: ["novo", "revisar"] }), ["a", "c", "d"]);
  assert.deepEqual(f({ responsavel: ["Ana"] }), ["a"]);
  assert.deepEqual(f({ responsavel: [SEM_RESPONSAVEL] }), ["b", "d"]);
  assert.deepEqual(f({ tipo: ["novo"], responsavel: ["Ana"] }), ["a"]);
  assert.ok(temFiltro({ ...SEM_FILTRO, tipo: ["novo"] }));
  assert.ok(temFiltro({ ...SEM_FILTRO, responsavel: ["Ana"] }));
});

test("filtro da análise prévia separa o já olhado, e a tag casa por qualquer uma", () => {
  const comAnalise = (
    id: string,
    a: Partial<ProjetoCiclo["analise"]>,
  ): ProjetoCiclo =>
    projeto({
      id,
      analise: {
        temParecer: false,
        tags: [],
        temDevolutiva: false,
        analisado: !!a.temParecer || (a.tags?.length ?? 0) > 0,
        atualizadoEm: null,
        ...a,
      },
    });

  const projetos = [
    comAnalise("a", { temParecer: true, tags: ["Crianças", "Educação"] }),
    comAnalise("b", { tags: ["Janela 10/40"] }),
    // Devolutiva ao proponente não é análise: a equipe pediu ajuste, não deu parecer.
    comAnalise("c", { temDevolutiva: true }),
    comAnalise("d", {}),
  ];

  const f = (p: Partial<Filtros>): string[] =>
    filtrar(projetos, { ...SEM_FILTRO, ...p }).map((x) => x.id);

  assert.deepEqual(f({ analise: ["sim"] }), ["a", "b"]);
  assert.deepEqual(f({ analise: ["nao"] }), ["c", "d"]);
  assert.deepEqual(f({ analise: ["sim", "nao"] }), ["a", "b", "c", "d"]);
  assert.deepEqual(f({ tag: ["Educação"] }), ["a"]);
  assert.deepEqual(
    f({ tag: ["Educação", "Janela 10/40"] }),
    ["a", "b"],
    "duas tags somam, e um projeto casa por qualquer uma",
  );
  assert.deepEqual(
    f({ tag: ["Janela 10/40"], analise: ["nao"] }),
    [],
    "os eixos continuam se cruzando",
  );
  assert.ok(temFiltro({ ...SEM_FILTRO, analise: ["sim"] }));
  assert.ok(temFiltro({ ...SEM_FILTRO, tag: ["Crianças"] }));
});

test("rejeitado, rascunho e cancelado não entram em pasta de diretor", () => {
  assert.equal(avaliavel("em-validacao"), true);
  assert.equal(avaliavel("rejeitado"), false);
  assert.equal(avaliavel("reprovado"), false);
  assert.equal(avaliavel("rascunho"), false, "escrito, nunca submetido");
  assert.equal(avaliavel("cancelado"), false);
  // Foi submetido e ainda pode voltar corrigido: continua na avaliação.
  assert.equal(avaliavel("devolvido-para-correcao"), true);

  const novoAtivo = triado("a", { tipo: "novo" }, { status: "em-validacao" });
  const novoRejeitado = triado("b", { tipo: "novo" }, { status: "rejeitado" });
  const revisarRascunho = triado(
    "c",
    { tipo: "revisar" },
    { status: "rascunho" },
  );

  assert.equal(vaiParaPasta(novoAtivo), true);
  assert.equal(vaiParaPasta(novoRejeitado), false);
  assert.equal(vaiParaPasta(revisarRascunho), false);

  // Rejeitado depois de distribuído some da pasta mesmo com o CSV ainda cheio.
  const pastas = montarPastas(
    [
      triado(
        "d",
        { tipo: "novo", responsavel: "Ana" },
        { status: "em-validacao" },
      ),
      triado(
        "e",
        { tipo: "novo", responsavel: "Ana" },
        { status: "rejeitado" },
      ),
    ],
    ["Ana"],
  );
  assert.deepEqual(
    pastas[0]!.projetos.map((p) => p.id),
    ["d"],
  );
});

test("pastas: só projetos novos, avaliador vazio aparece, sem-dono por último", () => {
  const projetos = [
    triado("a", { tipo: "novo", responsavel: "Ana" }, { solicitado: 100 }),
    triado("b", { tipo: "revisar", responsavel: "Ana" }, { solicitado: 50 }),
    triado("c", { tipo: "renovacao", responsavel: "Ana" }, { solicitado: 999 }),
    triado("d", { tipo: "novo" }, { solicitado: 10 }),
  ];

  const pastas = montarPastas(projetos, ["Ana", "Zuleide"]);
  assert.deepEqual(
    pastas.map((p) => p.responsavel),
    ["Ana", "Zuleide", SEM_RESPONSAVEL],
  );

  const ana = pastas[0]!;
  assert.deepEqual(
    ana.projetos.map((p) => p.id),
    ["a", "b"],
  );
  assert.equal(ana.solicitado, 150, "renovação não entra na pasta");
  assert.equal(ana.aRevisar, 1);

  assert.equal(
    pastas[1]!.projetos.length,
    0,
    "avaliador sem pasta continua na lista",
  );
  assert.equal(pastas[2]!.atribuida, false);
});

// ------------------------------------------- planilha .xlsx da exportação

test("xlsx: zip íntegro, células tipadas e texto escapado", () => {
  // Valor de conferência canônico do CRC-32 (IEEE): "123456789" → 0xCBF43926.
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);

  const bytes = planilha(
    "Projetos 2026",
    [
      ["Projeto", "Instituição", "Solicitado", "Recebido"],
      ["Água & Vida <BR>", "Missão X", 45000, 12000],
      ["Sem vínculo", "Missão Y", 1000, null],
    ],
    { larguras: [56, 38, 20, 26], congelar: 1 },
  );

  // Assinaturas do zip: entrada local, diretório central e o fim (5 partes).
  const cru = new TextDecoder().decode(bytes);
  assert.equal(cru.slice(0, 4), "PK\u0003\u0004");
  const fim = bytes.length - 22;
  assert.equal(
    new DataView(bytes.buffer, bytes.byteOffset).getUint32(fim, true),
    0x06054b50,
  );
  assert.equal(
    new DataView(bytes.buffer, bytes.byteOffset).getUint16(fim + 10, true),
    5,
  );

  // As partes vão sem compressão, então o XML da aba está legível aqui dentro.
  assert.match(
    cru,
    /<c r="A2" t="inlineStr"><is><t xml:space="preserve">Água &amp; Vida &lt;BR&gt;<\/t><\/is><\/c>/,
  );
  assert.match(cru, /<c r="C2"><v>45000<\/v><\/c>/);
  assert.ok(!cru.includes('r="D3"'), "célula nula é omitida, não vira zero");
  assert.match(cru, /ySplit="1"/);
});

/* ------------------------------------- leitura de .xlsx do visor de anexos */

/** Zip com uma entrada por parte, comprimida — é assim que o Excel grava. */
function ziparComprimido(
  partes: { nome: string; texto: string }[],
): Uint8Array {
  const enc = new TextEncoder();
  const locais: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let desloc = 0;

  for (const p of partes) {
    const nome = enc.encode(p.nome);
    const cru = enc.encode(p.texto);
    const dados = new Uint8Array(deflateRawSync(cru));
    const crc = crc32(cru);

    const local = new Uint8Array(30 + nome.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, 8, true); // método 8 = deflate
    lv.setUint32(14, crc, true);
    lv.setUint32(18, dados.length, true);
    lv.setUint32(22, cru.length, true);
    lv.setUint16(26, nome.length, true);
    local.set(nome, 30);
    locais.push(local, dados);

    const c = new Uint8Array(46 + nome.length);
    const cv = new DataView(c.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, 8, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, dados.length, true);
    cv.setUint32(24, cru.length, true);
    cv.setUint16(28, nome.length, true);
    cv.setUint32(42, desloc, true);
    c.set(nome, 46);
    central.push(c);
    desloc += local.length + dados.length;
  }

  const dir = central.reduce((s, c) => s + c.length, 0);
  const fim = new Uint8Array(22);
  const fv = new DataView(fim.buffer);
  fv.setUint32(0, 0x06054b50, true);
  fv.setUint16(8, partes.length, true);
  fv.setUint16(10, partes.length, true);
  fv.setUint32(12, dir, true);
  fv.setUint32(16, desloc, true);

  const total = [...locais, ...central, fim];
  const saida = new Uint8Array(total.reduce((s, p) => s + p.length, 0));
  let i = 0;
  for (const p of total) {
    saida.set(p, i);
    i += p.length;
  }
  return saida;
}

test("xlsx-ler: entrada comprimida, texto compartilhado e formato da célula", async () => {
  const REL =
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const bytes = ziparComprimido([
    {
      nome: "xl/workbook.xml",
      texto:
        `<workbook><sheets>` +
        `<sheet name="Or&#231;amento" sheetId="1" r:id="rId1"/>` +
        `<sheet name="Cronograma" sheetId="2" r:id="rId2"/>` +
        `</sheets></workbook>`,
    },
    {
      nome: "xl/_rels/workbook.xml.rels",
      texto:
        `<Relationships>` +
        `<Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/>` +
        `<Relationship Id="rId2" Type="${REL}/worksheet" Target="worksheets/sheet2.xml"/>` +
        `</Relationships>`,
    },
    {
      nome: "xl/sharedStrings.xml",
      // Texto quebrado em runs (negrito no meio) é um <si> com dois <t>.
      texto: `<sst><si><t>Impress</t><t>ão &amp; frete</t></si><si><t>Total</t></si></sst>`,
    },
    {
      nome: "xl/styles.xml",
      texto:
        `<styleSheet>` +
        `<numFmts><numFmt numFmtId="164" formatCode="&quot;R$&quot;\\ #,##0.00"/>` +
        `<numFmt numFmtId="165" formatCode="0.0%"/></numFmts>` +
        `<cellStyleXfs><xf numFmtId="0"/></cellStyleXfs>` +
        `<cellXfs><xf numFmtId="0"/><xf numFmtId="164"/><xf numFmtId="165"/>` +
        `<xf numFmtId="14"/></cellXfs></styleSheet>`,
    },
    {
      nome: "xl/worksheets/sheet1.xml",
      texto:
        `<worksheet><sheetData>` +
        `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" s="1"><v>6000</v></c></row>` +
        // Buraco em B, valor em C: a coluna precisa cair no lugar certo.
        `<row r="2"><c r="A2" t="s"><v>1</v></c><c r="C2" s="2"><v>0.219</v></c></row>` +
        `<row r="3"><c r="A3" s="3"><v>45292</v></c><c r="B3" t="inlineStr"><is><t>2026</t></is></c></row>` +
        `<row r="4"><c r="A4"/></row>` +
        `</sheetData></worksheet>`,
    },
    {
      nome: "xl/worksheets/sheet2.xml",
      texto: `<worksheet><sheetData/></worksheet>`,
    },
  ]);

  const abas = await lerXlsx(bytes);
  assert.equal(abas.length, 2);
  assert.deepEqual(
    abas.map((a) => a.nome),
    ["Orçamento", "Cronograma"],
  );

  const [orcamento] = abas;
  // A linha 4 é só uma célula vazia: não vira linha na tela.
  assert.deepEqual(orcamento!.linhas, [
    ["Impressão & frete", "R$ 6.000,00", ""],
    ["Total", "", "21,9%"],
    // 45292 é 01/01/2024 no serial do Excel; "2026" ao lado é texto, e por ser
    // texto não pode virar data nem ganhar separador de milhar.
    ["01/01/2024", "2026", ""],
  ]);
  assert.equal(orcamento!.linhasTotal, 3);
  // Aba sem célula nenhuma existe (planilha montada com imagens coladas).
  assert.deepEqual(abas[1]!.linhas, []);
});

test("xlsx-ler: lê de volta o que o exportador do painel grava", async () => {
  // Round-trip com o escritor real: entradas ARMAZENADAS (método 0), inlineStr
  // e número cru — o outro caminho do zip, que o teste comprimido não cobre.
  const abas = await lerXlsx(
    planilha("Projetos 2026", [
      ["Projeto", "Solicitado"],
      ["Água & Vida <BR>", 45000],
      ["Sem vínculo", null],
    ]),
  );
  assert.deepEqual(abas[0]!.linhas, [
    ["Projeto", "Solicitado"],
    ["Água & Vida <BR>", "45000"],
    ["Sem vínculo", ""],
  ]);
});

/* ---------------------------------------------------- vocabulário impresso */

test("plural escreve a palavra, não 'projeto(s)'", () => {
  // Sai em ata, em PDF de conselho e na TV da reunião: "1 projeto(s)" é forma
  // de log. O zero é plural em português ("0 projetos"), e o milhar leva
  // separador pt-BR porque a mesma string vai para o papel.
  assert.equal(plural(1, "projeto", "projetos"), "1 projeto");
  assert.equal(plural(2, "projeto", "projetos"), "2 projetos");
  assert.equal(plural(0, "projeto", "projetos"), "0 projetos");
  assert.equal(plural(1234, "projeto", "projetos"), "1.234 projetos");
  assert.equal(plural(1, "avaliação", "avaliações"), "1 avaliação");
  assert.equal(plural(3, "mês", "meses"), "3 meses");
});

test("variacaoPedido diz o salto da renovação, e cala sem base", () => {
  // É a conta que a mesa fazia de cabeça na pasta do projeto. Sem verba no
  // ciclo anterior não há percentual — devolve "" e a linha não inventa nada.
  assert.equal(variacaoPedido(150, 100), "pede 50% a mais");
  assert.equal(variacaoPedido(80, 100), "pede 20% a menos");
  assert.equal(variacaoPedido(100, 100), "pede o mesmo valor");
  assert.equal(variacaoPedido(100_000, null), "");
  assert.equal(variacaoPedido(100_000, 0), "");
});

test("setaVariacao carrega a direção no sinal, para o PDF e a planilha", () => {
  assert.equal(setaVariacao(150, 100), "↑ 50%");
  assert.equal(setaVariacao(80, 100), "↓ 20%");
  assert.equal(setaVariacao(100, 100), "= 0%");
  assert.equal(setaVariacao(100_000, null), "");
  assert.equal(deltaPedido(150, 100), 0.5);
  assert.equal(deltaPedido(150, null), null);
});

/* ------------------------------------- concentração e renovações (Fase 6) */

test("curva acumulada ordena do maior pedido ao menor e ignora valor zero", () => {
  const cum = curvaAcumulada([
    projeto({ id: "a", solicitado: 10 }),
    projeto({ id: "b", solicitado: 100 }),
    projeto({ id: "c", solicitado: 0 }),
    projeto({ id: "d", solicitado: 40 }),
  ]);
  // Zero não é projeto pequeno, é ausência de pedido: entraria como um degrau
  // plano na cauda e diria que há mais projetos disputando do que há.
  assert.deepEqual(cum, [100, 140, 150]);
});

test("projetosAte encontra o corte do teto e não inventa um quando não há", () => {
  const cum = [100, 140, 150];
  assert.equal(projetosAte(cum, 75), 1);
  assert.equal(
    projetosAte(cum, 100),
    1,
    "o alvo exato fecha no projeto que o atinge",
  );
  assert.equal(projetosAte(cum, 140), 2);
  // Teto acima do total: a remessa inteira cabe, não há cauda a cortar.
  assert.equal(projetosAte(cum, 900), 3);
  assert.equal(projetosAte([], 50), 0);
});

test("renovações medem o pedido contra o que o projeto recebeu antes", () => {
  const r = montarRenovacoes([
    // sem vínculo: entra no ciclo, mas não tem base de comparação
    projeto({ id: "novo", solicitado: 50_000 }),
    triado("igual", { recebidoAnterior: 30_000 }, { solicitado: 30_000 }),
    triado("menos", { recebidoAnterior: 40_000 }, { solicitado: 20_000 }),
    triado("mais20", { recebidoAnterior: 100_000 }, { solicitado: 120_000 }),
    triado("dobra", { recebidoAnterior: 10_000 }, { solicitado: 30_000 }),
    // recebido 0 seria divisão por zero disfarçada de crescimento infinito
    triado("semBase", { recebidoAnterior: 0 }, { solicitado: 90_000 }),
  ]);

  assert.equal(r.projetos.length, 4);
  assert.equal(r.pedido, 200_000);
  assert.equal(r.recebido, 180_000);
  assert.ok(Math.abs((r.variacao ?? 0) - 20_000 / 180_000) < 1e-9);

  const faixa = (rotulo: string) => r.faixas.find((f) => f.rotulo === rotulo)!;
  assert.equal(faixa("Pede menos").projetos, 1);
  assert.equal(faixa("Repete o valor").projetos, 1);
  assert.equal(faixa("Até +25%").projetos, 1);
  assert.equal(faixa("Mais que dobra").projetos, 1);
  assert.equal(faixa("Mais que dobra").pedido, 30_000);
  assert.equal(
    r.faixas.reduce((s, f) => s + f.projetos, 0),
    4,
    "as faixas particionam: nenhum projeto em duas, nenhum de fora",
  );
});

test("ciclo sem nenhuma renovação vinculada não divide por zero", () => {
  const r = montarRenovacoes([projeto({ id: "a", solicitado: 10_000 })]);
  assert.equal(r.projetos.length, 0);
  assert.equal(r.variacao, null);
});

// -------------------------------------------- link do Drive (prestação, Fase 9)

test("link do Drive vira URL embutível, em todas as formas que a equipe cola", () => {
  const preview = (u: string) => embedDrive(u);

  // Arquivo solto: o link de "compartilhar" e as duas formas antigas.
  assert.equal(
    preview("https://drive.google.com/file/d/1AbC-dEf_9/view?usp=sharing"),
    "https://drive.google.com/file/d/1AbC-dEf_9/preview",
  );
  assert.equal(
    preview("https://drive.google.com/open?id=1AbC-dEf_9"),
    "https://drive.google.com/file/d/1AbC-dEf_9/preview",
  );
  assert.equal(
    preview("https://drive.google.com/uc?export=download&id=1AbC-dEf_9"),
    "https://drive.google.com/file/d/1AbC-dEf_9/preview",
  );

  // Documento do Workspace: a prestação digitada direto no Google Docs/Sheets.
  assert.equal(
    preview("https://docs.google.com/spreadsheets/d/1XyZ/edit#gid=0"),
    "https://docs.google.com/spreadsheets/d/1XyZ/preview",
  );

  // Pasta — o caso de "uma pasta por projeto", que vira a lista dos arquivos.
  assert.equal(
    preview("https://drive.google.com/drive/u/0/folders/1PaSt4"),
    "https://drive.google.com/embeddedfolderview?id=1PaSt4#list",
  );
  assert.equal(
    rotuloDrive("https://drive.google.com/drive/folders/1PaSt4"),
    "Pasta no Drive",
  );
});

test("o que não é Drive não é embutido às cegas", () => {
  assert.equal(embedDrive("https://exemplo.org/relatorio.pdf"), null);
  // O visor só embute o que embedDrive reconhece — isto vale como guarda de que
  // um link colado à mão não vira <iframe> de qualquer origem.
  assert.equal(
    embedDrive("https://drive.google.com.evil.test/file/d/1A/view"),
    null,
  );
  assert.equal(embedDrive("javascript:alert(1)"), null);
});

// ------------------------------------------------------------ parcerias

test("parcerias: UF, município e as duas agregações", async () => {
  const { chaveMunicipio, montarBrasil, montarMundo, ufDe } =
    await import("../src/lib/parcerias");
  assert.equal(ufDe("Rio Grande Norte"), "RN");
  assert.equal(ufDe("Goias"), "GO");
  assert.equal(ufDe("pe"), "PE");
  assert.equal(ufDe("-"), null);
  assert.equal(
    chaveMunicipio("SAO JOSE DOS CAMPOS", "SP"),
    chaveMunicipio("São José dos Campos", "SP"),
  );

  const local = (iso3: string | null, nomePt = iso3 ?? "") => ({
    iso3,
    nomePt,
    continente: "x",
    sensivel: !iso3,
    fonte: "country" as const,
    bruto: nomePt,
  });
  const miss = (
    extra: Partial<import("../src/lib/parcerias").Missionario>,
  ) => ({
    agencia: "JMM" as const,
    nome: "M",
    local: local("NPL", "Nepal"),
    regiao: null,
    publico: null,
    tipo: null,
    municipio: null,
    uf: null,
    codigoIbge: null,
    recebido2026: null,
    chave: "JMM:m",
    ...extra,
  });
  const proj = (
    iso3: string,
    status = "em-validacao",
    estado: string | null = null,
  ) =>
    ({
      local: local(iso3),
      status,
      statusGrupo: status === "aprovado" ? "aprovado" : "em-avaliacao",
      estado,
    }) as never;

  const mundo = montarMundo(
    [proj("MOZ"), proj("PER", "rejeitado")],
    [proj("PER", "aprovado")],
    [
      miss({ chave: "a" }),
      miss({ chave: "b", agencia: "APMT", recebido2026: 1000 }),
      miss({ chave: "c", local: local("MOZ") }),
      miss({ chave: "d", local: local("PER") }),
      miss({ chave: "e", local: local(null), regiao: "Área 14 - Sahel" }),
      miss({ chave: "f", agencia: "JMN-IPB", local: local("BRA"), uf: "SE" }),
    ],
    [{ chave: "a", rotulo: "", nota: "", marcadoEm: "" }],
    [
      { agencia: "JMM", local: local("JPN", "Japão") },
      { agencia: "JMM", local: local("MOZ") },
      { agencia: "JMM", local: local(null, "Oriente Médio") },
    ],
  );
  const por = Object.fromEntries(mundo.paises.map((p) => [p.chave, p]));
  // País só declarado: conta como país com agência, sem inventar missionário.
  assert.equal(por["JPN"]!.missionarios, 0);
  assert.equal(por["JPN"]!.situacao, "oportunidade");
  assert.deepEqual(por["MOZ"]!.porAgencia, { JMM: 1 });
  assert.equal(por["Oriente Médio"], undefined);
  assert.equal(por["NPL"]!.situacao, "oportunidade");
  assert.equal(por["NPL"]!.parceiros2026, 1);
  assert.equal(por["NPL"]!.candidatos, 1);
  assert.equal(por["MOZ"]!.situacao, "atendido");
  // Pedido rejeitado não "atinge" o país; aprovado no anterior → retomar.
  assert.equal(por["PER"]!.situacao, "retomar");
  assert.equal(por["Área 14 - Sahel"]!.sensivel, true);
  assert.equal(mundo.comAgencia, 4);
  assert.equal(mundo.paises[0]!.chave, "PER"); // retomar vem primeiro
  assert.equal(mundo.missionariosDisponiveis, 4);

  const cidade = {
    codigo: "2800308",
    nome: "Aracaju",
    uf: "SE",
    lat: 0,
    lon: 0,
    demanda: 12,
  };
  const br = montarBrasil(
    [proj("BRA", "em-validacao", "PE"), proj("BRA", "rascunho", "SE")],
    [
      miss({
        chave: "f",
        agencia: "JMN-IPB",
        local: local("BRA"),
        uf: "SE",
        codigoIbge: "2800308",
      }),
      miss({
        chave: "g",
        agencia: "JMN-CBB",
        local: local("BRA"),
        uf: "SE",
        municipio: "Colônia 13",
      }),
    ],
    [cidade],
    [],
  );
  assert.equal(br.cobertas, 1);
  assert.equal(br.descobertas, 26);
  assert.equal(br.descobertasComMissionario, 1);
  assert.equal(br.ufs[0]!.uf, "SE"); // descoberta com gente em alta demanda primeiro
  assert.equal(br.ufs[0]!.melhor?.municipio.nome, "Aracaju");
  assert.equal(br.ufs[0]!.emAltaDemanda, 1);
  assert.equal(br.ufs[0]!.missionarios, 2); // IPB + CBB somam na UF
  assert.equal(br.cidadesAltaDemanda, 1);
  assert.equal(br.pontos[0]!.missionarios.length, 1);
});

test("geometria do Brasil: 27 UFs com path e projeção dentro do viewBox", async () => {
  const { geometriaBrasil, LARGURA_BR, ALTURA_BR } =
    await import("../src/lib/mapa");
  const g = geometriaBrasil();
  assert.equal(g.ufs.length, 27);
  assert.ok(g.ufs.every((u) => u.d.length > 50));
  const recife = g.projetar([-34.9333, -8.0403])!;
  assert.ok(
    recife[0] > 0 &&
      recife[0] < LARGURA_BR &&
      recife[1] > 0 &&
      recife[1] < ALTURA_BR,
  );
});

// ------------------------------ diretriz orçamentária por rubrica (Fase 12)

const pedido = (
  id: string,
  categoria: string,
  solicitado: number,
  tipo: "novo" | "renovacao" = "novo",
) => triado(id, { tipo }, { categoria, solicitado });

test("rubricas: envelope vem do teto, desvio sai em reais e em pontos", () => {
  const d = montarDiretriz(
    [
      pedido("a", "missoes-transculturais", 400, "renovacao"),
      pedido("b", "missoes-nacionais", 100),
      pedido("c", "construcao-reforma", 300),
      pedido("d", "educacao", 50),
      pedido("e", "projetos-sociais-cristaos", 150),
    ],
    1000,
  );

  assert.equal(d.pedido, 1000);
  assert.equal(d.projetos, 5);

  const por = new Map(d.linhas.map((l) => [l.chave, l]));

  // Missões bate a diretriz na mosca: 50% do pedido para um alvo de 50%.
  const missoes = por.get("missoes")!;
  assert.equal(missoes.pedido, 500);
  assert.equal(missoes.envelope, 500);
  assert.equal(missoes.desvio, 0);
  assert.equal(missoes.desvioPp, 0);
  assert.equal(missoes.projetos, 2);
  assert.equal(missoes.renovacoes, 1);
  assert.equal(missoes.novos, 1);
  assert.equal(missoes.pedidoRenovacoes, 400);
  assert.equal(missoes.pedidoNovos, 100);

  // Social pede o triplo do que a diretriz reserva.
  const social = por.get("social")!;
  assert.equal(social.envelope, 50);
  assert.equal(social.desvio, 100);
  assert.ok(Math.abs(social.desvioPp - 0.1) < 1e-9);

  // Outros fica abaixo — o desvio negativo não entra no remanejamento.
  assert.equal(por.get("outros")!.desvio, -150);
  assert.equal(d.remanejar, 150); // 100 do social + 50 da construção

  assert.equal(d.acima?.chave, "social");
  assert.equal(d.abaixo?.chave, "outros");

  // Sem "fora das rubricas" quando toda categoria está mapeada.
  assert.equal(d.linhas.length, 4);
});

test("rubricas: pedido acima do teto separa cortar de remanejar, e a régua nunca contradiz o desvio", () => {
  // Pedido 1100 para um teto de 1000: vão de 100. Envelopes: 500 · 250 · 200 · 50.
  const d = montarDiretriz(
    [
      pedido("a", "missoes-nacionais", 495), // 45,0% do pedido, mas 495 < 500: abaixo
      pedido("b", "construcao-reforma", 255), // 255 > 250: acima do envelope
      pedido("c", "educacao", 300), // 300 > 200: acima
      pedido("d", "projetos-sociais-cristaos", 50), // 50 = 50
    ],
    1000,
  );
  const por = new Map(d.linhas.map((l) => [l.chave, l]));

  assert.equal(d.cortar, 100);
  // Excesso 5 + 100 = 105; folga 5 (Missões). Mover só cabe o que há de folga.
  assert.equal(d.remanejar, 5);

  // O sinal do desvio em pontos é sempre o do desvio em reais: com teto, os dois
  // saem da mesma conta (pedido − teto × alvo).
  for (const l of d.linhas) {
    assert.equal(Math.sign(l.desvioPp), Math.sign(l.desvio ?? 0), l.chave);
  }
  assert.ok(Math.abs(por.get("outros")!.desvioPp - 0.1) < 1e-9);
});

test("rubricas: cabendo no teto não há o que cortar, só remanejar", () => {
  const d = montarDiretriz(
    [pedido("a", "missoes-nacionais", 300), pedido("b", "educacao", 400)],
    1000,
  );
  assert.equal(d.cortar, 0);
  // Outros pede 400 para um envelope de 200: 200 de excesso, e sobra folga de sobra.
  assert.equal(d.remanejar, 200);
});

test("categoria que a diretriz não nomeia soma numa linha própria", () => {
  const d = montarDiretriz(
    [pedido("a", "missoes-nacionais", 500), pedido("b", "capelania", 500)],
    1000,
  );
  const fora = d.linhas.find((l) => l.chave === FORA_DA_DIRETRIZ)!;
  assert.equal(fora.pedido, 500);
  assert.equal(fora.alvo, 0);
  assert.deepEqual(fora.categorias, ["capelania"]);
  // A diretriz não reserva nada para ela: o pedido inteiro é excesso.
  assert.equal(fora.desvio, 500);
  assert.equal(d.acima?.chave, FORA_DA_DIRETRIZ);
});

test("recorte vazio e ciclo sem teto não inventam desvio", () => {
  const vazio = montarDiretriz([], 1000);
  assert.equal(vazio.pedido, 0);
  assert.ok(vazio.linhas.every((l) => l.desvioPp === 0));
  assert.equal(vazio.acima, null);
  assert.equal(vazio.abaixo, null);

  const semTeto = montarDiretriz(
    [pedido("a", "projetos-sociais-cristaos", 100)],
    null,
  );
  assert.equal(semTeto.remanejar, null);
  assert.equal(semTeto.cortar, null);
  assert.ok(semTeto.linhas.every((l) => l.envelope === null));
  assert.ok(semTeto.linhas.every((l) => l.desvio === null));
  // A aderência em pontos não depende do teto — é o que sobra quando ele falta.
  assert.equal(semTeto.acima?.chave, "social");
  assert.equal(rotuloRubrica("projetos-sociais-cristaos"), "Social");
  assert.equal(rotuloRubrica("capelania"), "Fora das rubricas");
});

test("sessão: assinatura, vencimento, adulteração e lista fechada", async () => {
  const { assinarSessao, lerSessao, sessaoValida, destinoSeguro } =
    await import("../src/lib/sessao");
  const seg = "x".repeat(40);
  const uid = "032a79ca-6cf0-4dee-a521-61f10ad1aaa1";
  const exp = Math.floor(Date.now() / 1000) + 60;
  const t = assinarSessao({ uid, nome: "F", exp }, seg);

  assert.equal(lerSessao(t, seg)?.uid, uid);
  assert.equal(lerSessao(t, "y".repeat(40)), null, "segredo errado");
  assert.equal(lerSessao(t, seg, (exp + 1) * 1000), null, "vencida");
  const [corpo, ass] = t.split(".");
  const outro = Buffer.from(
    JSON.stringify({ uid: "x", nome: "F", exp }),
  ).toString("base64url");
  assert.equal(lerSessao(`${outro}.${ass}`, seg), null, "corpo trocado");
  assert.equal(lerSessao(`${corpo}.${ass}.x`, seg), null);
  assert.equal(lerSessao(undefined, seg), null);

  process.env.SESSAO_SEGREDO = seg;
  process.env.PAINEL_USUARIOS = uid.toUpperCase() + ", lixo";
  assert.equal(sessaoValida(t)?.uid, uid);
  process.env.PAINEL_USUARIOS = "04cbdcf6-5fc9-45ca-9a8b-dc6088598560";
  assert.equal(sessaoValida(t), null, "tirado da lista perde a sessão");
  process.env.SESSAO_SEGREDO = "curto";
  assert.throws(() => sessaoValida(t), "sem segredo decente ninguém entra");

  assert.equal(destinoSeguro("/projetos?x=1"), "/projetos?x=1");
  for (const ruim of [
    "//evil.com",
    "/\\evil.com",
    "https://evil.com",
    "",
    "evil",
    "/\t/evil.com",
    "/\n/evil.com",
  ])
    assert.equal(destinoSeguro(ruim), "/", ruim);
});
