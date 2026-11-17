/**
 * Triagem da reunião: gera/atualiza `data/avaliadores.csv` e a coleção
 * `triagem` do Firestore (banco do painel) a partir da origem (só SELECT).
 *
 *   npm run avaliacao:regen                   → grava o CSV e o Firestore
 *   npm run avaliacao:regen -- --dry          → só mostra o que mudaria
 *   npm run avaliacao:regen -- --ano=2026     → outra remessa (padrão: a mais recente)
 *   npm run avaliacao:regen -- --reequilibrar → nivela as pastas (move o mínimo)
 *
 * O que ele faz:
 *  1. casa cada projeto da remessa com um da remessa anterior, pela mesma
 *     instituição e similaridade de título (src/lib/recorrencia.ts) — daí sai
 *     novo × renovação e "quanto recebeu no ano passado";
 *  2. distribui os projetos NOVOS **não rejeitados** entre os diretores/
 *     conselheiros ativos, em quantidades parecidas.
 *
 * **Nada é reatribuído.** Projeto que já tem responsável fica com ele — rodar de
 * novo quando chegarem projetos novos só distribui os que faltam, e a pasta de
 * quem já se preparou não muda. Idem para os campos curados (`tipo`,
 * `projetoAnteriorId`, `observacoes`), editados na pasta do projeto: o script
 * nunca os grava (merge no Firestore).
 *
 * O que devolve a vaga para a fila (limpando `responsavel`, sempre reportado): o
 * projeto **saiu da avaliação** depois de distribuído — vira renovação na
 * revisão da equipe, ou é rejeitado/cancelado/volta a rascunho — ou o responsável
 * foi **desativado** em `data/avaliadores.csv`. Sem isso o projeto fica órfão:
 * some das pastas e nunca é redistribuído.
 *
 * Só que devolver a vaga não repõe: a rodada normal só distribui projeto SEM
 * dono, e se não sobrou nenhum a pasta simplesmente encolhe. É para isso que
 * existe `--reequilibrar`, que nivela movendo o mínimo — também é o jeito de dar
 * pasta a um avaliador que entrou depois da distribuição.
 *
 * Nada é escrito no banco de origem. Ver docs/fase5-projetos.md.
 */
import { writeFileSync } from "node:fs";
import { stringify } from "csv-stringify/sync";
import { closePool, query } from "../src/lib/db";
import { fetchAvaliadores, fetchProjetosChave } from "../src/lib/queries";
import { AVALIADORES_CSV, carregarAvaliadores } from "../src/lib/enrichment";
import { carregarTriagem, gravarTriagemGerada } from "../src/lib/painel-db";
import type { TipoRevisao } from "../src/lib/types";
import { avaliavel } from "../src/lib/agregar";
import {
  distribuir,
  reequilibrar,
  sugerirVinculo,
} from "../src/lib/recorrencia";
import type { CandidatoAnterior } from "../src/lib/recorrencia";

const COLUNAS_AVALIADORES = ["user_id", "nome", "papel", "ativo"] as const;

function gravar(caminho: string, linhas: object[], colunas: readonly string[]) {
  // BOM + CRLF: os outros CSVs de data/ já são assim, e a equipe abre no Excel.
  const csv =
    "﻿" +
    stringify(linhas, {
      header: true,
      columns: [...colunas],
      record_delimiter: "windows",
    });
  writeFileSync(caminho, csv, "utf-8");
  console.log(`Gravado: ${caminho}`);
}

async function main(): Promise<void> {
  const dry = process.argv.includes("--dry");
  const nivelar = process.argv.includes("--reequilibrar");
  const anoArg = process.argv
    .find((a) => a.startsWith("--ano="))
    ?.split("=")[1];

  const [avaliadoresOrigem, todos] = await Promise.all([
    fetchAvaliadores(),
    fetchProjetosChave(),
  ]);

  // ------------------------------------------------------- avaliadores.csv
  const curadoAtivo = new Map(
    carregarAvaliadores(true).map((a) => [a.nome, a.ativo]),
  );
  const avaliadores = avaliadoresOrigem.map((a) => ({
    user_id: a.user_id,
    nome: a.name ?? "(sem nome)",
    papel: a.role,
    ativo: (curadoAtivo.get(a.name ?? "") ?? true) ? "sim" : "não",
  }));
  const ativos = avaliadores
    .filter((a) => a.ativo === "sim")
    .map((a) => a.nome);

  console.log(
    `Avaliadores: ${avaliadores.length} (${ativos.length} ativos) — ${ativos.join(", ")}`,
  );
  if (ativos.length === 0) {
    console.warn(
      "AVISO: nenhum avaliador ativo. Nenhuma pasta será distribuída.",
    );
  }

  // ------------------------------------------------- Firestore/triagem
  const anos = [...new Set(todos.map((p) => p.year))].sort((a, b) => b - a);
  const ano = anoArg ? Number(anoArg) : anos[0];
  if (!ano || !anos.includes(ano)) {
    throw new Error(
      `Remessa ${anoArg ?? "?"} não existe. Há: ${anos.join(", ")}`,
    );
  }
  const anoAnterior = anos.find((a) => a < ano);

  const daRemessa = todos.filter((p) => p.year === ano);
  const anteriores: CandidatoAnterior[] = todos
    .filter((p) => p.year === anoAnterior)
    .map((p) => ({
      id: p.id,
      titulo: p.title,
      instituicaoId: p.institution_id,
      aprovado: p.approved_amount,
    }));

  const existentes = await carregarTriagem();

  const linhas = daRemessa.map((p) => {
    const s = sugerirVinculo(
      { titulo: p.title, instituicaoId: p.institution_id },
      anteriores,
    );
    const curado = existentes.get(p.id);

    return {
      project_id: p.id,
      ano,
      titulo: p.title,
      instituicao: "",
      instituicao_id: p.institution_id ?? "",
      status: p.status,
      solicitado: Number(p.requested_amount ?? 0).toFixed(2),
      sugestao_tipo: s.tipo,
      similaridade: s.similaridade === null ? "" : s.similaridade.toFixed(3),
      sugestao_projeto_anterior_id: s.anteriorId ?? "",
      sugestao_projeto_anterior_titulo: s.anteriorTitulo ?? "",
      sugestao_recebido_anterior:
        s.recebidoAnterior === null ? "" : s.recebidoAnterior.toFixed(2),
      // Curadas: gravadas de volta VERBATIM. Nunca o valor efetivo — senão um
      // `projeto_anterior_id` preenchido sozinho carimbaria a sugestão na coluna
      // `tipo`, e o palpite viraria decisão da equipe sem ninguém ter decidido.
      tipo: curado?.tipoCurado ?? "",
      projeto_anterior_id: curado?.projetoAnteriorIdCurado ?? "",
      responsavel: curado?.responsavel ?? "",
      observacoes: curado?.observacoes ?? "",
    };
  });

  // O nome da instituição não vem em fetchProjetosChave — uma consulta só, para
  // a planilha ficar legível para quem abre no Excel.
  const nomes = await query<{ id: string; name: string }>(
    "select id, name from institutions",
  );
  const porId = new Map(nomes.map((n) => [n.id, n.name]));
  for (const l of linhas) l.instituicao = porId.get(l.instituicao_id) ?? "";

  // --------------------------------------------------------- distribuição
  const tipoEfetivo = (l: (typeof linhas)[number]) => l.tipo || l.sugestao_tipo;

  // Quem entra em pasta: novo (ou a revisar) e NÃO rejeitado. "revisar" entra
  // como novo de propósito — errar para o lado de alguém ler o projeto é barato;
  // deixar um projeto novo sem dono na reunião não é.
  const paraPasta = (l: (typeof linhas)[number]) =>
    tipoEfetivo(l) !== "renovacao" && avaliavel(l.status);

  // Nome fora do avaliadores.csv é atribuição manual deliberada: NUNCA é mexido,
  // por nenhuma das regras abaixo. Ele também não ocupa vaga de pasta nenhuma,
  // então não há nada a devolver.
  const conhecidos = new Set(avaliadores.map((a) => a.nome));
  const inativos = new Set(
    avaliadores.filter((a) => a.ativo !== "sim").map((a) => a.nome),
  );

  // Duas coisas devolvem a vaga para a fila. Sem isso o projeto fica órfão:
  // some das pastas (que só mostram avaliador ativo) e nunca é redistribuído.
  //  - o projeto saiu da avaliação: virou renovação na revisão da equipe, ou foi
  //    rejeitado/cancelado/voltou a rascunho;
  //  - o responsável foi DESATIVADO em data/avaliadores.csv.
  const devolvidosDaPasta = linhas.filter(
    (l) => l.responsavel && conhecidos.has(l.responsavel) && !paraPasta(l),
  );
  const devolvidosPorInativo = linhas.filter(
    (l) => l.responsavel && paraPasta(l) && inativos.has(l.responsavel),
  );
  for (const l of [...devolvidosDaPasta, ...devolvidosPorInativo]) {
    l.responsavel = "";
  }

  const paraDistribuir = linhas
    .filter((l) => paraPasta(l) && !l.responsavel)
    .map((l) => l.project_id);

  const carga = new Map<string, number>();
  for (const l of linhas) {
    if (l.responsavel)
      carga.set(l.responsavel, (carga.get(l.responsavel) ?? 0) + 1);
  }

  const destino = distribuir(paraDistribuir, ativos, carga);
  for (const l of linhas) {
    const novo = destino.get(l.project_id);
    if (novo) l.responsavel = novo;
  }

  // Nivela por último, já sobre o estado final: devolver vaga não repõe nada
  // (a distribuição só pega projeto sem dono), então quem perdeu projeto para a
  // revisão ou entrou depois só empata aqui.
  const movidos = nivelar
    ? reequilibrar(
        linhas
          .filter((l) => paraPasta(l) && l.responsavel)
          .map((l) => ({ id: l.project_id, responsavel: l.responsavel })),
        ativos,
      )
    : new Map<string, string>();
  for (const l of linhas) {
    const novo = movidos.get(l.project_id);
    if (novo) l.responsavel = novo;
  }

  // ------------------------------------------------------------ relatório
  const conta = (t: string) =>
    linhas.filter((l) => tipoEfetivo(l) === t).length;
  const duplicados = new Map<string, string[]>();
  for (const l of linhas) {
    const alvo = l.projeto_anterior_id || l.sugestao_projeto_anterior_id;
    if (alvo) duplicados.set(alvo, [...(duplicados.get(alvo) ?? []), l.titulo]);
  }
  const disputados = [...duplicados.values()].filter((v) => v.length > 1);

  console.log(`\nRemessa ${ano} (anterior: ${anoAnterior ?? "nenhuma"})`);
  console.log(`Projetos:      ${linhas.length}`);
  console.log(`  renovação:   ${conta("renovacao")}`);
  console.log(`  novo:        ${conta("novo")}`);
  console.log(
    `  a revisar:   ${conta("revisar")}  ← vínculo plausível, decidir na pasta do projeto`,
  );
  console.log(
    `Fora das pastas:      ${linhas.filter((l) => !paraPasta(l) && tipoEfetivo(l) !== "renovacao").length} (rejeitado/rascunho/cancelado)`,
  );
  console.log(
    `Curadoria preservada: ${linhas.filter((l) => l.tipo || l.observacoes || l.projeto_anterior_id).length} linha(s)`,
  );
  console.log(`Distribuídos agora:   ${destino.size}`);
  if (devolvidosDaPasta.length) {
    console.log(
      `Vagas devolvidas:     ${devolvidosDaPasta.length} (saíram da avaliação depois de distribuídos)`,
    );
  }
  if (devolvidosPorInativo.length) {
    console.log(
      `Redistribuídos:       ${devolvidosPorInativo.length} (eram de avaliador desativado: ${[...inativos].join(", ")})`,
    );
  }
  if (nivelar) {
    console.log(
      `Reequilibradas:       ${movidos.size} projeto(s) mudaram de pasta (--reequilibrar)`,
    );
  }

  const cargaFinal = new Map<string, number>();
  for (const l of linhas) {
    if (l.responsavel)
      cargaFinal.set(l.responsavel, (cargaFinal.get(l.responsavel) ?? 0) + 1);
  }
  console.log("\nPastas:");
  for (const nome of ativos) {
    console.log(`  ${nome.padEnd(28)} ${cargaFinal.get(nome) ?? 0}`);
  }
  const orfaos = linhas.filter((l) => paraPasta(l) && !l.responsavel).length;
  if (orfaos) console.log(`  (sem responsável)            ${orfaos}`);

  // As pastas encolhem sozinhas (projeto reclassificado ou rejeitado sai) e um
  // avaliador novo entra com zero — em nenhum dos casos a rodada normal repõe.
  // Avisar aqui é o que evita descobrir isso na reunião.
  const valores = ativos.map((n) => cargaFinal.get(n) ?? 0);
  const min = valores.length ? Math.min(...valores) : 0;
  const max = valores.length ? Math.max(...valores) : 0;
  const vazios = ativos.filter((n) => !cargaFinal.get(n));

  // Diferença de 1–2 é o arredondamento normal da divisão. O que importa é
  // alguém com ZERO (entrou depois) ou um buraco grande.
  if (!nivelar && (vazios.length > 0 || max - min > 2)) {
    console.log(
      `\nAVISO: pastas desequilibradas (${min} a ${max})` +
        (vazios.length ? ` — sem nenhum projeto: ${vazios.join(", ")}` : "") +
        "\n  Rodar `npm run avaliacao:regen -- --reequilibrar` nivela movendo o mínimo:" +
        "\n  só quem está acima do teto solta projeto; as outras pastas não são tocadas.",
    );
  }

  if (disputados.length) {
    console.log(
      `\nAVISO: ${disputados.length} projeto(s) da remessa anterior foram casados por mais de um projeto desta:`,
    );
    for (const titulos of disputados.slice(0, 10)) {
      console.log(`  - ${titulos.join(" | ")}`);
    }
    console.log(
      "  Confira o vínculo na pasta do projeto: dois projetos não renovam o mesmo.",
    );
  }

  if (dry) {
    console.log("\n--dry: nada foi gravado.");
    await closePool();
    return;
  }

  console.log("");
  gravar(AVALIADORES_CSV, avaliadores, COLUNAS_AVALIADORES);
  const num = (v: string) => (v === "" ? null : Number(v));
  await gravarTriagemGerada(
    linhas.map((l) => ({
      projectId: l.project_id,
      ano: l.ano,
      titulo: l.titulo,
      instituicao: l.instituicao,
      instituicaoId: l.instituicao_id || null,
      status: l.status,
      solicitado: Number(l.solicitado),
      sugestaoTipo: l.sugestao_tipo as TipoRevisao,
      similaridade: num(l.similaridade),
      sugestaoProjetoAnteriorId: l.sugestao_projeto_anterior_id || null,
      sugestaoProjetoAnteriorTitulo: l.sugestao_projeto_anterior_titulo || null,
      sugestaoRecebidoAnterior: num(l.sugestao_recebido_anterior),
      responsavel: l.responsavel || null,
    })),
  );
  console.log(`Gravado: Firestore/triagem (${linhas.length} projetos)`);
  await closePool();
}

main().catch(async (erro) => {
  console.error("Erro:", erro instanceof Error ? erro.message : erro);
  await closePool();
  process.exitCode = 1;
});
