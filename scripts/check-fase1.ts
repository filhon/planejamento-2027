/**
 * Relatório de sanidade da Fase 1 (fundação de dados).
 *
 *   npm run check            → todos os ciclos
 *   npm run check -- 2026    → só um ano
 *
 * Confere: conexão pelo pooler, guarda de somente-leitura, cobertura do de-para
 * de país, cobertura do enriquecimento e os números dos datasets contra o
 * snapshot dos docs. Só faz SELECT na origem.
 */
import {
  assertReadOnly,
  closePool,
  pingDatabase,
  query,
  ReadOnlyViolationError,
} from "../src/lib/db";
import { dados } from "../src/lib/cache";
import {
  agregarPorInstituicao,
  montarCobertura,
  vaiParaPasta,
} from "../src/lib/agregar";
import {
  carregarCountryMap,
  carregarInstitutionEnrichment,
  resumirCobertura,
} from "../src/lib/enrichment";
import { construirIndicePaises, dobrar, normalizarLocal } from "../src/lib/geo";
import { GRUPO_SENSIVEL } from "../src/lib/types";
import { ALTA_DEMANDA, montarBrasil, montarMundo } from "../src/lib/parcerias";

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});
const num = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const pct = (v: number | null) =>
  v === null ? "—" : `${num.format(v * 100)}%`;

const falhas: string[] = [];
const avisos: string[] = [];

function titulo(t: string): void {
  console.log(`\n${"─".repeat(72)}\n${t}\n${"─".repeat(72)}`);
}

function ok(msg: string): void {
  console.log(`  ✓ ${msg}`);
}
function falha(msg: string): void {
  console.log(`  ✗ ${msg}`);
  falhas.push(msg);
}
function aviso(msg: string): void {
  console.log(`  ! ${msg}`);
  avisos.push(msg);
}

/** Números publicados em docs/ (snapshot 2026-09-04) para detectar deriva. */
const SNAPSHOT_DOCS: Record<
  number,
  { projetos: number; solicitado: number; aprovado?: number }
> = {
  2025: { projetos: 264, solicitado: 15_999_796, aprovado: 11_423_782 },
  2026: { projetos: 262, solicitado: 23_600_000 },
};

async function checarConexao(): Promise<void> {
  titulo("1. Conexão com a origem (somente leitura)");
  const info = await pingDatabase();
  ok(
    `${info.serverVersion} · ${info.host}:${info.port}/${info.database} como ${info.user}`,
  );
  if (info.viaPooler) ok("via pooler IPv4 (host direto db.* é IPv6-only)");
  else
    aviso(
      "conexão sem pooler — nesta máquina o host direto costuma falhar (IPv6-only)",
    );
  if (info.sessionReadOnly)
    ok("sessão travada em default_transaction_read_only = on");
  else
    aviso("sessão NÃO está read-only no servidor; a guarda de SQL segue ativa");
}

function checarGuarda(): void {
  titulo("2. Guarda de somente-leitura");
  const proibidos = [
    "insert into cycle_projects (id) values ('x')",
    "update cycle_projects set title = 'x'",
    "delete from cycle_projects",
    "create view vw_projetos as select 1",
    "alter table cycle_projects add column x int",
    "grant select on cycle_projects to bi_readonly",
    "select 1; drop table cycle_projects",
    "truncate cycle_projects",
  ];
  let bloqueados = 0;
  for (const sql of proibidos) {
    try {
      assertReadOnly(sql);
      falha(`comando de escrita NÃO foi bloqueado: ${sql}`);
    } catch (erro) {
      if (erro instanceof ReadOnlyViolationError) bloqueados += 1;
      else throw erro;
    }
  }
  if (bloqueados === proibidos.length)
    ok(`${bloqueados}/${proibidos.length} comandos de escrita bloqueados`);

  try {
    assertReadOnly("with x as (select 1) select * from x");
    ok("SELECT/CTE legítimo passa");
  } catch {
    falha("um SELECT legítimo foi bloqueado pela guarda");
  }
}

async function checarDeParaPaises(): Promise<void> {
  titulo("3. De-para de país (data/country_map.csv)");
  const mapa = carregarCountryMap();
  ok(
    `${mapa.length} linhas no de-para · ${new Set(mapa.map((m) => m.iso3)).size} países ISO-3`,
  );

  const brutos = await query<{ country: string | null; n: number }>(`
    select country, count(*)::int as n from cycle_projects group by country order by n desc
  `);
  const chaves = new Set(mapa.map((m) => dobrar(m.rawCountry)));
  const naoMapeados = brutos.filter(
    (b) =>
      b.country &&
      !["outro", "outros"].includes(dobrar(b.country)) &&
      !chaves.has(dobrar(b.country)),
  );

  if (naoMapeados.length === 0) {
    ok(
      `todos os ${brutos.length} valores distintos de country estão mapeados (fora 'Outro')`,
    );
  } else {
    falha(
      `país sem linha no CSV: ${naoMapeados.map((b) => `${b.country} (${b.n})`).join(", ")} — completar data/country_map.csv`,
    );
  }

  // Resgate dos 'Outro' via state/city
  const indice = construirIndicePaises(mapa);
  const outros = await query<{
    id: string;
    country: string | null;
    state: string | null;
    city: string | null;
  }>(`
    select id, country, state, city from cycle_projects
    where country is null or btrim(country) = '' or lower(btrim(country)) = 'outro'
  `);
  const resolvidos = outros.map((o) => normalizarLocal(o, indice));
  const recuperados = resolvidos.filter((r) => r.iso3 !== null);
  const multipais = resolvidos.filter((r) => r.iso3 === null);
  ok(
    `'Outro'/vazio: ${outros.length} projetos → ${recuperados.length} com país resgatado de state/city, ` +
      `${multipais.length} em "${GRUPO_SENSIVEL}"`,
  );
  const porPais = [
    ...new Set(recuperados.map((r) => `${r.nomePt} (${r.iso3})`)),
  ].sort();
  if (porPais.length) console.log(`      resgatados: ${porPais.join(", ")}`);
}

async function checarEnriquecimento(): Promise<void> {
  titulo("4. Enriquecimento por instituição (data/institution_enrichment.csv)");
  const csv = carregarInstitutionEnrichment();
  const cobertura = resumirCobertura(csv);
  const naOrigem = await query<{ id: string; name: string }>(
    "select id, name from institutions",
  );

  const idsCsv = new Set(csv.map((c) => c.institutionId));
  const idsDb = new Set(naOrigem.map((i) => i.id));
  const faltando = naOrigem.filter((i) => !idsCsv.has(i.id));
  const sobrando = csv.filter((c) => !idsDb.has(c.institutionId));

  ok(
    `${cobertura.totalNoCsv} linhas no CSV · ${naOrigem.length} instituições na origem`,
  );
  if (faltando.length === 0) ok("toda instituição da origem tem linha no CSV");
  else
    falha(
      `${faltando.length} instituição(ões) sem linha no CSV (rodar \`npm run enrich:regen\`): ` +
        faltando
          .slice(0, 5)
          .map((i) => i.name)
          .join(", ") +
        (faltando.length > 5 ? "…" : ""),
    );
  if (sobrando.length > 0)
    aviso(
      `${sobrando.length} linha(s) do CSV sem instituição correspondente na origem`,
    );

  // Fase 4: documentos apontando para instituição que não existe mais.
  const conf = await dados.conformidade();
  const orfas = Object.keys(conf.porInstituicao).filter((id) => !idsDb.has(id));
  if (orfas.length === 0)
    ok(
      `institution_documents: ${Object.keys(conf.porInstituicao).length} instituições, ${conf.tiposExigidos} tipos exigidos`,
    );
  else
    aviso(
      `${orfas.length} institution_id em institution_documents sem instituição na origem (documentos órfãos) — o painel os ignora`,
    );

  const curadas = `anos de parceria: ${cobertura.curadasComAno}/${cobertura.totalNoCsv} · tipo: ${cobertura.curadasComTipo} · observações: ${cobertura.curadasComObservacao}`;
  if (cobertura.curadasComAno === 0)
    aviso(
      `colunas curadas ainda vazias (${curadas}) — preenchimento é da equipe`,
    );
  else ok(`colunas curadas preenchidas — ${curadas}`);
}

/**
 * Fase 5: a triagem da reunião. O risco real aqui é a planilha ficar velha —
 * projeto novo continua chegando até o fim do mês, e um projeto que entra
 * depois do último `avaliacao:regen` fica sem triagem e sem dono.
 */
async function checarTriagem(ano: number): Promise<void> {
  titulo(`4b. Triagem da reunião ${ano} (data/projetos_avaliacao.csv)`);

  const projetos = await dados.projetos(ano);
  const avaliadores = await dados.avaliadores();
  const ativos = avaliadores.filter((a) => a.ativo);

  if (avaliadores.length === 0) {
    aviso(
      "data/avaliadores.csv ainda não existe — rodar `npm run avaliacao:regen`",
    );
  } else {
    ok(`${avaliadores.length} avaliadores (${ativos.length} ativos)`);
  }

  const conta = (t: string) =>
    projetos.filter((p) => p.revisao.tipo === t).length;
  const semLinha = projetos.filter((p) => !p.revisao.naTriagem);
  const semDono = projetos.filter(
    (p) => vaiParaPasta(p) && !p.revisao.responsavel,
  );
  // Rejeitado em pasta é justamente o que o `avaliacao:regen` desfaz.
  const rejeitadoEmPasta = projetos.filter(
    (p) =>
      !vaiParaPasta(p) &&
      p.revisao.tipo !== "renovacao" &&
      p.revisao.responsavel,
  );

  ok(
    `${projetos.length} projetos · renovação ${conta("renovacao")} · novo ${conta("novo")} · a revisar ${conta("revisar")}`,
  );
  ok(
    `${projetos.filter(vaiParaPasta).length} vão para pasta de diretor (rejeitado, rascunho e cancelado ficam de fora)`,
  );

  if (rejeitadoEmPasta.length > 0) {
    aviso(
      `ciclo ${ano}: ${rejeitadoEmPasta.length} projeto(s) fora da avaliação ainda com responsável no CSV — rodar \`npm run avaliacao:regen\` para devolver as vagas`,
    );
  }

  // O caso "todos sem linha" é CSV inexistente; alguns sem linha é CSV velho.
  if (semLinha.length === projetos.length && projetos.length > 0) {
    aviso(
      `ciclo ${ano}: triagem não gerada — rodar \`npm run avaliacao:regen\` antes da reunião`,
    );
  } else if (semLinha.length > 0) {
    aviso(
      `ciclo ${ano}: ${semLinha.length} projeto(s) sem linha na triagem (chegaram depois do último regen) — rodar \`npm run avaliacao:regen\``,
    );
  }

  if (semDono.length > 0 && ativos.length > 0) {
    aviso(
      `ciclo ${ano}: ${semDono.length} projeto(s) novo(s) sem responsável — rodar \`npm run avaliacao:regen\``,
    );
  }

  if (conta("revisar") > 0) {
    aviso(
      `ciclo ${ano}: ${conta("revisar")} projeto(s) com vínculo a decidir (coluna \`tipo\` do CSV) — hoje entram como novos`,
    );
  }

  // Dois projetos não renovam o mesmo: sinal de vínculo errado ou submissão duplicada.
  const porAnterior = new Map<string, number>();
  for (const p of projetos) {
    const id = p.revisao.projetoAnteriorId;
    if (id) porAnterior.set(id, (porAnterior.get(id) ?? 0) + 1);
  }
  const disputados = [...porAnterior.values()].filter((n) => n > 1).length;
  if (disputados > 0) {
    aviso(
      `ciclo ${ano}: ${disputados} projeto(s) da remessa anterior vinculados por mais de um projeto desta — conferir no CSV`,
    );
  }

  const cargas = ativos.map(
    (a) =>
      projetos.filter(
        (p) => vaiParaPasta(p) && p.revisao.responsavel === a.nome,
      ).length,
  );
  if (cargas.length > 0) {
    const min = Math.min(...cargas);
    const max = Math.max(...cargas);
    ok(`pastas: ${min} a ${max} projetos por avaliador`);
    const vazios = ativos.filter(
      (a) =>
        !projetos.some(
          (p) => vaiParaPasta(p) && p.revisao.responsavel === a.nome,
        ),
    );
    // 1–2 de diferença é o arredondamento da divisão; zero é avaliador esquecido.
    if (vazios.length > 0 || max - min > 2) {
      aviso(
        `ciclo ${ano}: pastas desequilibradas (${min} a ${max})` +
          (vazios.length
            ? ` — sem pasta: ${vazios.map((a) => a.nome).join(", ")} (entrou depois da distribuição?)`
            : "") +
          " — `npm run avaliacao:regen -- --reequilibrar` nivela movendo o mínimo",
      );
    }
  }
}

/** Fase 11: os CSVs das agências casam com o de-para e com os municípios? */
async function checarParcerias(ano: number): Promise<void> {
  titulo("4c. Parcerias proativas (data/db-*.csv, ranking-dd.csv)");

  const [dp, projetos, anteriores] = await Promise.all([
    dados.parcerias(),
    dados.projetos(ano),
    dados.projetos(ano - 1).catch(() => []),
  ]);
  const porAgencia = (a: string) =>
    dp.missionarios.filter((m) => m.agencia === a).length;
  ok(
    `${dp.missionarios.length} missionários · APMT ${porAgencia("APMT")} · JMM ${porAgencia("JMM")} · JMN-IPB ${porAgencia("JMN-IPB")}`,
  );
  const semLocal = dp.missionarios.filter((m) => !m.local.iso3 && !m.regiao);
  if (semLocal.length)
    aviso(`${semLocal.length} sem país informado pela agência`);
  if (dp.pendencias.paisesSemDePara.length)
    falha(
      `país sem de-para: ${dp.pendencias.paisesSemDePara.join(", ")} — completar data/country_map.csv`,
    );
  else ok("todo país das agências está no de-para");
  const jmn = dp.missionarios.filter((m) => m.agencia === "JMN-IPB");
  ok(
    `${jmn.filter((m) => m.codigoIbge).length} de ${jmn.length} da JMN casados com município do IBGE`,
  );
  if (dp.pendencias.municipiosSemCasar.length)
    aviso(
      `sem casar (bairro/distrito?): ${dp.pendencias.municipiosSemCasar.join(", ")}`,
    );
  const noRanking = dp.municipios.filter((m) => m.demanda !== null).length;
  ok(
    `${noRanking} municípios no ranking de demanda · top ${ALTA_DEMANDA} inteiro casado: ${dp.municipios.filter((m) => m.demanda !== null && m.demanda <= ALTA_DEMANDA).length === ALTA_DEMANDA ? "sim" : "NÃO"}`,
  );

  const mundo = montarMundo(
    projetos,
    anteriores,
    dp.missionarios,
    dp.candidatos,
  );
  ok(
    `mundo: ${mundo.comAgencia} países com agência · ${mundo.oportunidades} sem pedido em ${ano} · ${mundo.retomar} a retomar · ${mundo.missionariosDisponiveis} missionários disponíveis`,
  );
  const br = montarBrasil(
    projetos,
    dp.missionarios,
    dp.municipios,
    dp.candidatos,
  );
  ok(
    `brasil: ${br.cobertas} UFs com projeto · ${br.descobertas} sem (${br.ufs
      .filter((u) => !u.coberta)
      .map((u) => u.uf)
      .join(
        ", ",
      )}) · ${br.descobertasComMissionario} delas com missionário JMN`,
  );
  if (br.semUf) aviso(`${br.semUf} projetos do Brasil sem UF reconhecível`);
  ok(`${dp.candidatos.length} candidatos marcados`);
}

async function checarCiclo(ano: number): Promise<void> {
  titulo(`5. Ciclo ${ano} — datasets`);

  const [resumo, locais, orcamento, avaliacoes, projetos, relatorios, conf] =
    await Promise.all([
      dados.resumo(ano),
      dados.locais(ano),
      dados.orcamento(ano),
      dados.avaliacoes(ano),
      dados.projetos(ano),
      dados.prestacao(),
      dados.conformidade(),
    ]);

  console.log(
    `  projetos_ciclo: ${resumo.projetos} projetos · ${brl.format(resumo.solicitado)} solicitado · ` +
      `${brl.format(resumo.aprovado)} aprovado`,
  );
  console.log(
    `  KPIs: ${resumo.paisesAlcancados} países · ${pct(resumo.fracaoInternacional)} internacionais · ` +
      `${resumo.projetosSensiveis} em área sensível · ${resumo.instituicoes} instituições ` +
      `(${resumo.instituicoesConveniadas} conveniadas)`,
  );
  console.log(
    `  status: ${resumo.porStatus.map((s) => `${s.status} ${s.projetos}`).join(" · ")}`,
  );
  console.log(
    `  projeto_local (top 5): ${locais
      .slice(0, 5)
      .map((l) => `${l.nomePt} ${l.projetos}`)
      .join(" · ")}`,
  );
  console.log(
    `  continentes: ${resumo.porContinente.map((c) => `${c.continente} ${c.projetos}`).join(" · ")}`,
  );

  const naoMapeado = locais.filter((l) => l.continente === "Não mapeado");
  if (naoMapeado.length)
    falha(
      `países sem ISO no ciclo ${ano}: ${naoMapeado.map((l) => l.nomePt).join(", ")}`,
    );

  console.log(
    `  orcamento_ciclo: teto ${orcamento.tetoTotal === null ? "—" : brl.format(orcamento.tetoTotal)} ` +
      `(conveniadas ${orcamento.tetoConveniadas === null ? "—" : brl.format(orcamento.tetoConveniadas)} · ` +
      `não conveniadas ${orcamento.tetoNaoConveniadas === null ? "—" : brl.format(orcamento.tetoNaoConveniadas)}) · ` +
      `pressão da demanda ${pct(orcamento.pressaoDemanda)} · linha usada: ${orcamento.fonteOrcamento.status ?? "—"} ` +
      `(${orcamento.fonteOrcamento.criterio})`,
  );
  for (const a of orcamento.fonteOrcamento.alertas)
    aviso(`orçamento ${ano}: ${a}`);
  if (orcamento.tetoTotal === null)
    falha(`ciclo ${ano} sem teto de orçamento utilizável`);

  const g = avaliacoes.geral;
  if (g.n === 0) {
    console.log("  avaliacoes_ciclo: nenhuma avaliação registrada neste ciclo");
  } else {
    console.log(
      `  avaliacoes_ciclo: n=${g.n} · média ${num.format(g.media ?? 0)} · mediana ${num.format(g.mediana ?? 0)} · ` +
        `p25–p75 ${num.format(g.p25 ?? 0)}–${num.format(g.p75 ?? 0)} · desvio ${num.format(g.desvio ?? 0)} · ` +
        `notas 10,0: ${pct(g.fracaoNotaMaxima)}`,
    );
    console.log(
      `  por conselheiro: ${avaliacoes.porConselheiro
        .map(
          (c) =>
            `${c.conselheiro.split(" ")[0]} n=${c.n} med=${num.format(c.mediana ?? 0)}`,
        )
        .join(" · ")}`,
    );
  }

  // --- Fase 4: instituições e prestação de contas
  const instituicoes = agregarPorInstituicao(projetos, conf.porInstituicao);
  const emDia = instituicoes.filter(
    (i) => i.documentos.total > 0 && i.documentos.pendentes === 0,
  );
  console.log(
    `  instituicoes_ciclo: ${instituicoes.length} instituições · ` +
      `${instituicoes.filter((i) => i.conveniada).length} conveniadas · ` +
      `${emDia.length} com documentação em dia (${conf.tiposExigidos} tipos exigidos) · ` +
      `top 3 por verba: ${instituicoes
        .slice(0, 3)
        .map(
          (i) =>
            `${i.nome.slice(0, 24)} ${brl.format(i.aprovado || i.solicitado)}`,
        )
        .join(" · ")}`,
  );

  const cob = montarCobertura(projetos, relatorios, ano);
  console.log(
    `  prestacao_ciclo: ${cob.comRelatorio}/${cob.financiados} projetos financiados prestaram contas ` +
      `(${pct(cob.cobertura)}) · ${cob.relatorios} relatórios (${cob.rascunhos} em rascunho) · ` +
      `${brl.format(cob.aprovadoDescoberto)} aprovados sem prestação · ` +
      `trimestres: ${cob.porTrimestre.map((t) => `${t.rotulo} ${t.relatorios}`).join(" · ") || "—"}`,
  );
  if (cob.relatoriosForaDoEsperado > 0)
    aviso(
      `ciclo ${ano}: ${cob.relatoriosForaDoEsperado} relatório(s) de prestação em projeto que não está aprovado`,
    );
  if (cob.relatoriosDeOutroCiclo > 0)
    aviso(
      `ciclo ${ano}: ${cob.relatoriosDeOutroCiclo} relatório(s) com cycle_id de outra remessa (a remessa vem do projeto) — conferir o carimbo com a equipe`,
    );
  if (cob.financiados > 0 && cob.cobertura < 0.5)
    aviso(
      `ciclo ${ano}: cobertura da prestação de contas em ${pct(cob.cobertura)} — a maior parte do aprovado segue sem relatório`,
    );

  const esperado = SNAPSHOT_DOCS[ano];
  if (esperado) {
    const dProj = resumo.projetos - esperado.projetos;
    const dVal = resumo.solicitado - esperado.solicitado;
    if (dProj === 0)
      ok(`bate com o snapshot dos docs (${esperado.projetos} projetos)`);
    else
      aviso(
        `deriva vs. docs: ${resumo.projetos} projetos (docs: ${esperado.projetos}, ${dProj > 0 ? "+" : ""}${dProj}) · ` +
          `solicitado ${brl.format(resumo.solicitado)} (docs: ~${brl.format(esperado.solicitado)}, ${dVal > 0 ? "+" : ""}${brl.format(dVal)})`,
      );
    if (esperado.aprovado !== undefined) {
      const dApr = Math.abs(resumo.aprovado - esperado.aprovado);
      if (dApr < 1)
        ok(`aprovado bate com os docs (${brl.format(resumo.aprovado)})`);
      else
        aviso(
          `aprovado ${brl.format(resumo.aprovado)} ≠ docs ${brl.format(esperado.aprovado)}`,
        );
    }
  }
}

async function main(): Promise<void> {
  const argAno = process.argv[2] ? Number(process.argv[2]) : null;
  console.log(
    "Painel Consultivo Hebron ASEEC — checagem da Fase 1 (fundação de dados)",
  );
  console.log("A origem é somente leitura: este script só executa SELECT.");

  await checarConexao();
  checarGuarda();
  await checarDeParaPaises();
  await checarEnriquecimento();

  const listaCiclos = await dados.ciclos();
  titulo("Ciclos disponíveis");
  for (const c of listaCiclos) {
    console.log(
      `  ${c.ano} · ${c.nome} · status ${c.status} · annual_budget ${c.orcamentoAnual === null ? "não usado (0)" : brl.format(c.orcamentoAnual)}`,
    );
  }

  const anos = argAno ? [argAno] : listaCiclos.map((c) => c.ano);

  // A triagem só faz sentido na remessa aberta — é a que vai à reunião.
  const anoAberto = Math.max(...listaCiclos.map((c) => c.ano));
  if (anos.includes(anoAberto)) await checarTriagem(anoAberto);
  if (anos.includes(anoAberto)) await checarParcerias(anoAberto);

  for (const ano of anos) await checarCiclo(ano);

  titulo("Resultado");
  console.log(`  falhas: ${falhas.length} · avisos: ${avisos.length}`);
  for (const f of falhas) console.log(`   ✗ ${f}`);
  for (const a of avisos) console.log(`   ! ${a}`);
  console.log(
    falhas.length === 0
      ? "\n  Fundação de dados OK.\n"
      : "\n  Há falhas a resolver.\n",
  );

  await closePool();
  process.exitCode = falhas.length === 0 ? 0 : 1;
}

main().catch(async (erro) => {
  console.error("\nErro fatal:", erro instanceof Error ? erro.message : erro);
  await closePool();
  process.exitCode = 1;
});
