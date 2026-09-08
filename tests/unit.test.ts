/**
 * Testes das regras puras da fundação de dados — não tocam no banco.
 *   npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { assertReadOnly, ReadOnlyViolationError } from "../src/lib/db";
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
  filtrar,
  montarCobertura,
  montarPastas,
  SEM_FILTRO,
  SEM_RESPONSAVEL,
  temFiltro,
  vaiParaPasta,
  type Filtros,
} from "../src/lib/agregar";
import { carregarCountryMap } from "../src/lib/enrichment";
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

test("filtros globais se combinam e null conta como não conveniada", () => {
  const angola = normalizarLocal({ country: "Angola" }, indice);
  const universo = [
    projeto({ id: "a", conveniada: true, statusGrupo: "aprovado" }),
    projeto({ id: "b", conveniada: false, statusGrupo: "aprovado" }),
    projeto({ id: "c", conveniada: null, statusGrupo: "aprovado" }),
    projeto({
      id: "d",
      conveniada: true,
      statusGrupo: "rejeitado",
      categoria: "saude",
      local: angola,
    }),
  ];

  const ids = (f: Partial<Filtros>) =>
    filtrar(universo, { ...SEM_FILTRO, ...f }).map((p) => p.id);

  assert.deepEqual(ids({}), ["a", "b", "c", "d"], "sem filtro não recorta");
  assert.deepEqual(ids({ conveniada: ["true"] }), ["a", "d"]);
  // A instituição sem is_conveniada disputa o teto das NÃO conveniadas.
  assert.deepEqual(ids({ conveniada: ["false"] }), ["b", "c"]);
  assert.deepEqual(ids({ status: ["aprovado"] }), ["a", "b", "c"]);
  assert.deepEqual(ids({ iso3: "AGO" }), ["d"]);
  assert.deepEqual(ids({ conveniada: ["true"], status: ["aprovado"] }), ["a"]);
  assert.deepEqual(ids({ continente: ["África"], categoria: ["saude"] }), [
    "d",
  ]);

  // Multi-seleção: dentro do eixo soma (OU), entre eixos cruza (E).
  assert.deepEqual(
    ids({ status: ["aprovado", "rejeitado"] }),
    ["a", "b", "c", "d"],
    "dois status somam",
  );
  assert.deepEqual(ids({ conveniada: ["true", "false"] }), [
    "a",
    "b",
    "c",
    "d",
  ]);
  assert.deepEqual(
    ids({ status: ["aprovado", "rejeitado"], conveniada: ["true"] }),
    ["a", "d"],
    "os eixos continuam se cruzando",
  );
  assert.deepEqual(ids({ continente: ["África", "Ásia"] }), ["d"]);

  assert.deepEqual(alternar([], "x"), ["x"]);
  assert.deepEqual(alternar(["x"], "y"), ["x", "y"]);
  assert.deepEqual(alternar(["x", "y"], "x"), ["y"]);

  assert.equal(temFiltro(SEM_FILTRO), false);
  assert.equal(temFiltro({ ...SEM_FILTRO, iso3: "BRA" }), true);
  assert.equal(temFiltro({ ...SEM_FILTRO, conveniada: ["false"] }), true);
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
