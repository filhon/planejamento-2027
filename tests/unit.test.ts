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
} from "../src/lib/datasets";
import { carregarCountryMap } from "../src/lib/enrichment";
import { geometriaMundo } from "../src/lib/mapa";
import { GRUPO_SENSIVEL, type ProjetoCiclo } from "../src/lib/types";
import type { OrcamentoRow } from "../src/lib/queries";

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
    id: p.id ?? "p",
    categoria: p.categoria ?? "educacao",
    solicitado: p.solicitado ?? 0,
    aprovado: p.aprovado ?? 0,
    instituicaoId: p.instituicaoId ?? "i1",
    local: p.local ?? normalizarLocal({ country: "Brasil" }, indice),
  }) as ProjetoCiclo;

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
