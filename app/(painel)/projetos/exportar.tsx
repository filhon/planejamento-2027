"use client";

import { planilha, TIPO_XLSX } from "@/lib/xlsx";
import type { ProjetoCiclo } from "@/lib/types";
import { usePainel } from "../contexto";
import { urlVotacao } from "./ir-para";
import {
  deltaPedido,
  fmtInt,
  fmtMoeda,
  plural,
  resumoFiltros,
  rotuloResponsavel,
  setaVariacao,
} from "../formato";

/**
 * Exportar o recorte para o diretor levar embora — PDF e .xlsx.
 *
 * A regra da reunião: um responsável marcado → o material sai identificado com
 * o nome dele. Dois ou mais → sai o recorte como está, com uma nota dizendo que
 * a lista é a soma das pastas, porque um documento com dois nomes no campo
 * "Responsável" é entregue à pessoa errada.
 *
 * O PDF é um **documento de conselho**, não um print do painel: timbre, campos
 * de identificação, relação em tabela com filete, totais no rodapé da relação.
 * A cabeça de coluna se repete a cada página (`thead`), que é o que faz a folha
 * 3 continuar legível. Os valores saem sem "R$" na coluna (a unidade está no
 * cabeçalho) e com algarismo tabular, para a coluna alinhar como num anexo
 * financeiro. Cor só no timbre e nas réguas: sai da impressora do escritório em
 * preto e branco sem perder hierarquia nenhuma (ver PRODUCT.md, princípio 1).
 *
 * Sem biblioteca: o PDF é uma janela nova + `window.print()` (mesma escolha da
 * Fase 4) e o .xlsx é `src/lib/xlsx.ts`, ~200 linhas de zip + XML.
 */

export function baixar(nome: string, dados: BlobPart, tipo: string) {
  const url = URL.createObjectURL(new Blob([dados], { type: tipo }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  // Revogar na hora corta o download no Firefox; um tique depois já é seguro.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** "Pr. João Álvares" → "pr-joao-alvares" (nome de arquivo, não identidade). */
const apelido = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const escHtml = (s: string) =>
  s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Devolvido ao proponente: está na pasta, mas o sistema de votação ainda não o
 * mostra — o diretor busca e recebe "não existe". O material avisa antes.
 */
const emCorrecao = (p: ProjetoCiclo) => p.status === "devolvido-para-correcao";
const SITUACAO_CORRECAO =
  "Em correção pelo proponente — ainda não liberado para votação";

export default function Exportar({ lista }: { lista: ProjetoCiclo[] }) {
  const { ano, anoAnterior, filtros, nomePais } = usePainel();

  const donos = filtros.responsavel;
  const dono = donos.length === 1 ? rotuloResponsavel(donos[0]!) : null;
  const aviso =
    donos.length > 1
      ? `Atenção: ${donos.length} responsáveis selecionados (${donos
          .map(rotuloResponsavel)
          .join(
            ", ",
          )}). Esta lista é a soma das pastas, não a pasta de uma pessoa.`
      : null;

  const rotuloRecebido = `Recebido em ${ano} (janela ${anoAnterior ?? "—"})`;
  const recorte = resumoFiltros(filtros, nomePais);
  const titulo = `Projetos · Remessa ${ano}${dono ? ` · ${dono}` : ""}`;
  /** Vira o <title> do PDF: cabeçalho de página e nome sugerido do arquivo. */
  const nomeDocumento = `${dono ? "Pasta de avaliação" : "Projetos"} - Remessa ${ano}${
    dono ? ` - ${dono}` : ""
  }`;
  const arquivo = ["projetos", ano, dono && apelido(dono)]
    .filter(Boolean)
    .join("-");

  const nCorrecao = lista.filter(emCorrecao).length;
  const avisoCorrecao = nCorrecao
    ? `${plural(nCorrecao, "projeto desta lista foi devolvido", "projetos desta lista foram devolvidos")} ao proponente para correção e ainda não ${nCorrecao === 1 ? "aparece" : "aparecem"} no sistema de votação. ${nCorrecao === 1 ? "Ele está marcado" : "Estão marcados"} na relação; a busca no sistema volta a encontrá-${nCorrecao === 1 ? "lo" : "los"} quando a correção for reenviada.`
    : null;

  const totalSolicitado = lista.reduce((s, p) => s + p.solicitado, 0);
  const totalRecebido = lista.reduce(
    (s, p) => s + (p.revisao.recebidoAnterior ?? 0),
    0,
  );

  function exportarPlanilha() {
    const linhas = [
      [titulo],
      [`Recorte: ${recorte}`],
      ...(aviso ? [[aviso]] : []),
      ...(avisoCorrecao ? [[avisoCorrecao]] : []),
      [
        `${plural(lista.length, "projeto", "projetos")} · ${fmtMoeda.format(totalSolicitado)} solicitados · ${fmtMoeda.format(totalRecebido)} recebidos`,
      ],
      [],
      [
        "Nº",
        "Projeto",
        "Instituição",
        "Valor solicitado (R$)",
        `${rotuloRecebido} (R$)`,
        // Número cru e com sinal (18,6 = pede 18,6% a mais): o sinal é a seta,
        // e a coluna continua ordenável na planilha.
        "Variação do pedido (%)",
        "Situação",
        "Link na votação",
      ],
      ...lista.map((p) => {
        const d = deltaPedido(p.solicitado, p.revisao.recebidoAnterior);
        return [
          p.numero,
          p.titulo,
          p.instituicaoNome ?? "—",
          p.solicitado,
          p.revisao.recebidoAnterior,
          d === null ? null : Math.round(d * 1000) / 10,
          emCorrecao(p) ? SITUACAO_CORRECAO : null,
          { texto: urlVotacao(p.id), link: urlVotacao(p.id) },
        ];
      }),
    ];
    baixar(
      `${arquivo}.xlsx`,
      planilha(`Projetos ${ano}`, linhas, {
        larguras: [6, 56, 38, 20, 26, 22, 58, 90],
        // Tudo acima do cabeçalho fica preso: rolar 200 projetos sem ver de
        // quem é a lista é como o material volta errado da reunião.
        congelar: linhas.length - lista.length,
      }),
      TIPO_XLSX,
    );
  }

  function exportarPdf() {
    const janela = window.open("", "_blank");
    if (!janela) {
      alert(
        "O navegador bloqueou a janela de impressão. Libere os pop-ups deste site e tente de novo.",
      );
      return;
    }
    janela.document.write(paginaPdf());
    janela.document.close();
  }

  function paginaPdf() {
    const linhas = lista
      .map((p) => {
        const recebido = p.revisao.recebidoAnterior;
        return `<tr>
  <td class="ordem">${p.numero}</td>
  <td><a class="projeto" href="${escHtml(urlVotacao(p.id))}">${escHtml(p.titulo)}</a>
    <span class="instituicao">${escHtml(p.instituicaoNome ?? "instituição não informada")}</span>${
      emCorrecao(p)
        ? `\n    <span class="correcao">${escHtml(SITUACAO_CORRECAO)}</span>`
        : ""
    }</td>
  <td class="valor">${fmtInt.format(p.solicitado)}</td>
  <td class="valor historico">${recebido === null ? '<span class="sem">—</span>' : fmtInt.format(recebido)}</td>
  <td class="valor variacao ${(deltaPedido(p.solicitado, recebido) ?? 0) > 0 ? "sobe" : "desce"}">${
    setaVariacao(p.solicitado, recebido) || '<span class="sem">—</span>'
  }</td>
</tr>`;
      })
      .join("\n");

    const campo = (rotulo: string, valor: string) =>
      `<div><dt>${escHtml(rotulo)}</dt><dd>${escHtml(valor)}</dd></div>`;

    return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<!-- O navegador usa o <title> em duas coisas na impressão: o cabeçalho corrente
     de toda página e o nome sugerido do arquivo. Por isso ele é a identificação
     do documento, não o nome do arquivo em minúsculas. -->
<title>${escHtml(nomeDocumento)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Parkinsans:wght@500;600;700&family=Titillium+Web:wght@300;400;600;700&display=swap">
<style>
  /* Documento de conselho da Hebron ASEEC. Papel primeiro: a folha tem que
     funcionar em preto e branco, então a hierarquia é tipografia + filete, e a
     cor da marca só assina o timbre e as réguas. */
  :root {
    --papel: oklch(99.3% 0.002 265);
    --tinta: oklch(26% 0.06 268);        /* #16203f, o texto */
    --tinta-fraca: oklch(52% 0.045 268); /* rótulos e apoio */
    --azul: oklch(33% 0.16 272);         /* #202c85, a marca */
    --laranja: oklch(58% 0.19 45);       /* #ea5a06, a ação */
    --filete: oklch(88% 0.012 268);
    --filete-forte: oklch(72% 0.02 268);
    --nota: oklch(96.5% 0.008 268);
  }

  @page { size: A4 portrait; margin: 15mm 14mm 13mm; }

  * { box-sizing: border-box; print-color-adjust: exact; -webkit-print-color-adjust: exact; }

  body {
    margin: 0;
    background: var(--papel);
    color: var(--tinta);
    font-family: "Titillium Web", system-ui, sans-serif;
    font-size: 10pt;
    line-height: 1.4;
  }

  /* Rótulo de campo: versalete de documento, o mesmo em toda a folha. */
  dt, th, .rotulo, .ordem {
    font-size: 7pt;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--tinta-fraca);
  }

  /* ------------------------------------------------------------- timbre */

  .timbre {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-bottom: 6px;
    border-bottom: 0.75pt solid var(--filete-forte);
  }

  .timbre img { height: 26px; width: auto; }

  .timbre .nome {
    font-family: Parkinsans, system-ui, sans-serif;
    font-weight: 700;
    font-size: 9.5pt;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--azul);
    line-height: 1.15;
  }

  .timbre .orgao {
    font-size: 7.5pt;
    letter-spacing: 0.06em;
    color: var(--tinta-fraca);
  }

  /* A régua grossa da marca fecha o timbre — em cinza na fotocópia, continua
     sendo a linha que separa o cabeçalho do assunto. */
  .regua { height: 2.25pt; background: var(--azul); margin-bottom: 14px; }

  /* -------------------------------------------------------- identificação */

  h1 {
    font-family: Parkinsans, system-ui, sans-serif;
    font-weight: 600;
    font-size: 19pt;
    line-height: 1.1;
    letter-spacing: -0.015em;
    margin: 0;
  }

  .remessa { margin: 2px 0 0; font-size: 11pt; color: var(--tinta-fraca); }

  .identificacao {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px 28px;
    margin: 14px 0 0;
    padding: 10px 0;
    border-top: 0.75pt solid var(--filete);
    border-bottom: 0.75pt solid var(--filete);
  }

  .identificacao dl { margin: 0; display: grid; gap: 7px; }
  .identificacao dd { margin: 1px 0 0; }
  .identificacao .responsavel dd {
    font-family: Parkinsans, system-ui, sans-serif;
    font-weight: 600;
    font-size: 13pt;
    line-height: 1.15;
  }
  .identificacao .recorte dd { font-size: 9pt; }

  /* Os totais são campos do documento, não painel de indicadores: alinhados à
     direita, algarismo tabular, sem caixa em volta. */
  .totais { text-align: right; white-space: nowrap; }
  .totais dd {
    font-family: Parkinsans, system-ui, sans-serif;
    font-weight: 600;
    font-size: 12pt;
    font-variant-numeric: tabular-nums;
    line-height: 1.15;
  }

  .nota-bloco {
    margin-top: 12px;
    padding: 8px 11px;
    border: 0.75pt solid var(--filete-forte);
    background: var(--nota);
  }
  .nota-bloco p { margin: 2px 0 0; font-weight: 600; font-size: 9pt; }

  /* ------------------------------------------------------------- relação */

  .relacao {
    width: 100%;
    margin-top: 18px;
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
  }

  /* thead como grupo de cabeçalho repete a cada página impressa: é o que faz a
     folha 3 continuar dizendo o que é cada coluna. */
  .relacao thead th {
    text-align: left;
    padding: 0 8px 5px 0;
    border-bottom: 1.25pt solid var(--azul);
    vertical-align: bottom;
  }
  .relacao th.valor, .relacao td.valor { text-align: right; padding-right: 0; }
  .relacao th.valor { padding-left: 14px; }

  .relacao tbody td {
    padding: 6px 8px 6px 0;
    border-bottom: 0.5pt solid var(--filete);
    vertical-align: top;
  }
  .relacao tbody tr { break-inside: avoid; }

  .relacao td.ordem { width: 9mm; padding-top: 8px; }
  .relacao td.valor { width: 27mm; font-size: 10.5pt; font-weight: 600; }
  /* O solicitado é o número da decisão; o recebido é histórico. Mesmo tamanho,
     peso menor: a coluna da esquerda é a que o olho procura primeiro. */
  .relacao td.historico { font-weight: 400; }

  /* A seta carrega o sinal sozinha: em preto e branco a direção continua lá, a
     cor só reforça na tela e na impressora colorida. */
  .relacao td.variacao { width: 22mm; font-size: 9.5pt; font-weight: 600; }
  .relacao td.variacao.sobe { color: var(--laranja); }
  .relacao td.variacao.desce { color: var(--tinta-fraca); }
  .relacao .sem { color: var(--tinta-fraca); font-weight: 400; }

  .projeto { display: block; font-weight: 600; font-size: 10pt; overflow-wrap: anywhere; }
  /* O título é o link para a votação (clicável no PDF salvo). Sublinhado fino
     e a seta dizem isso sem cor — no papel, quem procura usa o Nº. */
  a.projeto { color: inherit; text-decoration: underline; text-decoration-thickness: 0.5pt;
    text-underline-offset: 2px; text-decoration-color: var(--filete-forte); }
  a.projeto::after { content: " \\2197"; font-weight: 400; color: var(--tinta-fraca); }
  .instituicao { display: block; font-size: 8.5pt; color: var(--tinta-fraca); }
  /* A palavra carrega o aviso; o filete e a cor só reforçam fora do P&B. */
  .correcao {
    display: inline-block; margin-top: 3px; padding: 1px 6px;
    border: 0.75pt solid var(--laranja); color: var(--laranja);
    font-size: 7.5pt; font-weight: 600;
  }

  .soma td {
    padding-top: 7px;
    border-top: 1.25pt solid var(--tinta);
    border-bottom: 0;
    font-weight: 700;
  }
  .soma td.valor { font-size: 10.5pt; font-weight: 700; }
  .soma .contagem { font-size: 9pt; font-weight: 600; }

  .vazio { margin: 20px 0; padding: 14px 0; border-top: 0.75pt solid var(--filete);
    border-bottom: 0.75pt solid var(--filete); text-align: center; color: var(--tinta-fraca); }

  /* ------------------------------------------------------------- rodapé */

  .pe {
    margin-top: 16px;
    padding-top: 7px;
    border-top: 0.75pt solid var(--filete-forte);
    font-size: 7.5pt;
    color: var(--tinta-fraca);
  }
  .pe p { margin: 0 0 3px; max-width: 62em; }
  .pe .assinatura { color: var(--azul); letter-spacing: 0.04em; }
</style>
</head>
<body>
  <header class="timbre">
    <img src="${location.origin}/simbolo.png" alt="">
    <div>
      <div class="nome">Hebron ASEEC</div>
      <div class="orgao">Painel Consultivo &middot; Planejamento de remessas</div>
    </div>
  </header>
  <div class="regua"></div>

  <h1>${dono ? "Pasta de avaliação" : "Relação de projetos"}</h1>
  <p class="remessa">Remessa ${ano}</p>

  <div class="identificacao">
    <dl>
      ${dono ? `<div class="responsavel"><dt>Responsável</dt><dd>${escHtml(dono)}</dd></div>` : ""}
      <div class="recorte"><dt>Recorte</dt><dd>${escHtml(recorte)}</dd></div>
      ${campo("Emitido em", new Date().toLocaleDateString("pt-BR"))}
    </dl>
    <dl class="totais">
      ${campo("Projetos", fmtInt.format(lista.length))}
      ${campo("Total solicitado", fmtMoeda.format(totalSolicitado))}
      ${campo(`Recebido em ${ano}`, fmtMoeda.format(totalRecebido))}
    </dl>
  </div>

  ${
    aviso
      ? `<section class="nota-bloco">
    <span class="rotulo">Nota</span>
    <p>${escHtml(aviso)}</p>
  </section>`
      : ""
  }

  ${
    avisoCorrecao
      ? `<section class="nota-bloco">
    <span class="rotulo">Em correção</span>
    <p>${escHtml(avisoCorrecao)}</p>
  </section>`
      : ""
  }

  ${
    lista.length === 0
      ? `<p class="vazio">Nenhum projeto corresponde ao recorte acima.</p>`
      : `<table class="relacao">
    <thead>
      <tr>
        <th class="ordem">Nº</th>
        <th>Projeto e instituição</th>
        <th class="valor">Solicitado (R$)</th>
        <th class="valor">Recebido em ${ano} (R$)</th>
        <th class="valor">Variação</th>
      </tr>
    </thead>
    <tbody>
${linhas}
      <tr class="soma">
        <td></td>
        <td class="contagem">Total &middot; ${plural(lista.length, "projeto", "projetos")}</td>
        <td class="valor">${fmtInt.format(totalSolicitado)}</td>
        <td class="valor">${fmtInt.format(totalRecebido)}</td>
        <!-- Sem variação no total: a soma do recebido não tem como base os
             mesmos projetos do solicitado (os sem vínculo entram com zero). -->
        <td></td>
      </tr>
    </tbody>
  </table>`
  }

  <footer class="pe">
    <p><b>Recebido em ${ano}</b> é o valor aprovado do projeto correspondente na remessa
      de ${anoAnterior ?? "—"}, pago no ciclo de ${ano}. O travessão indica projeto sem
      vínculo com a remessa anterior, ou sem valor recebido.</p>
    <p><b>Título do projeto</b> (&nearr;) abre o projeto no sistema de votação no PDF salvo;
      no papel, use o <b>Nº</b> no campo &ldquo;Ir para nº&rdquo; do painel.</p>
    <p><b>Variação</b> é quanto o pedido desta remessa sobe (&uarr;) ou desce (&darr;)
      sobre o valor recebido pelo mesmo projeto — só existe onde há esse vínculo.</p>
    <p class="assinatura">Hebron ASEEC &middot; Instrumentos de Deus na transformação de vidas.</p>
  </footer>

  <script>
    // Espera as fontes do Google, senão a primeira página imprime em Times.
    window.onload = function () {
      var pronto = document.fonts ? document.fonts.ready : Promise.resolve();
      pronto.then(function () { window.focus(); window.print(); });
    };
  </script>
</body>
</html>`;
  }

  return (
    <>
      <button
        className="botao-claro"
        title="Abre a impressão do navegador — escolha 'Salvar como PDF'"
        onClick={exportarPdf}
      >
        Exportar PDF
      </button>
      <button className="botao-claro" onClick={exportarPlanilha}>
        Exportar Excel
      </button>
    </>
  );
}
