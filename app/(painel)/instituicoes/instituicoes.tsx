"use client";

import { useMemo } from "react";
import { agregarPorInstituicao } from "@/lib/agregar";
import type { Conformidade, InstituicaoResumo } from "@/lib/types";
import { usePainel } from "../contexto";
import { fmtInt, fmtMoeda, fmtMoedaCurta, num, pct, plural } from "../formato";
import { Barras, Kpi, Secao } from "../ui";

/**
 * Instituições — quem recebe a verba, quanto concentra e quem está em dia com
 * a documentação (docs/plano-dashboard.md §4, página 05).
 *
 * O ranking reagrega dos projetos JÁ filtrados pelo painel; a conformidade
 * documental vem do servidor e não tem recorte (é da instituição, não do
 * ciclo) — por isso entra só como lookup por uuid.
 */

const ROTULO_DOCUMENTO: Record<string, string> = {
  ata_assembleia: "Ata de assembleia",
  cartao_cnpj: "Cartão CNPJ",
  comprovante_endereco: "Comprovante de endereço",
  estatuto: "Estatuto",
  relatorio_atividades: "Relatório de atividades",
};

const emDia = (i: InstituicaoResumo) =>
  i.documentos.total > 0 && i.documentos.pendentes === 0;

const somar = (is: InstituicaoResumo[], f: (i: InstituicaoResumo) => number) =>
  is.reduce((s, i) => s + f(i), 0);

/** Fatia do total que os N maiores concentram — o alerta de dependência. */
function concentracao(is: InstituicaoResumo[], n = 5) {
  const total = somar(is, (i) => i.solicitado);
  if (!total) return null;
  const topo = [...is].sort((a, b) => b.solicitado - a.solicitado).slice(0, n);
  return somar(topo, (i) => i.solicitado) / total;
}

export default function Instituicoes({
  conformidade,
}: {
  conformidade: Conformidade;
}) {
  const { ano, anoAnterior, projetos, projetosAnteriores, filtroAtivo } =
    usePainel();

  const lista = useMemo(
    () => agregarPorInstituicao(projetos, conformidade.porInstituicao),
    [projetos, conformidade],
  );
  const antes = useMemo(
    () =>
      agregarPorInstituicao(projetosAnteriores, conformidade.porInstituicao),
    [projetosAnteriores, conformidade],
  );

  const conveniadas = lista.filter((i) => i.conveniada);
  const recorrentes = lista.filter((i) => i.situacao === "recorrente");
  const documentadas = lista.filter(emDia);
  // Toda instituição tem as 5 linhas de documento; o que falta é o ENVIO.
  const semNenhum = lista.filter((i) => i.documentos.enviados === 0);
  const topo5 = concentracao(lista);

  const grupos = [
    { nome: "Conveniadas", itens: conveniadas },
    { nome: "Não conveniadas", itens: lista.filter((i) => !i.conveniada) },
  ];

  const situacoes = useMemo(() => {
    const contagem = new Map<string, number>();
    for (const i of lista) {
      const chave = i.situacao ?? "sem classificação";
      contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
    }
    return [...contagem.entries()].sort((a, b) => b[1] - a[1]);
  }, [lista]);

  const comparacao = anoAnterior
    ? [
        {
          metrica: "Instituições",
          a: lista.length,
          b: antes.length,
          fmt: (v: number) => fmtInt.format(v),
        },
        {
          metrica: "Conveniadas",
          a: conveniadas.length,
          b: antes.filter((i) => i.conveniada).length,
          fmt: (v: number) => fmtInt.format(v),
        },
        {
          metrica: "Projetos por instituição",
          a: lista.length ? projetos.length / lista.length : 0,
          b: antes.length ? projetosAnteriores.length / antes.length : 0,
          fmt: (v: number) => num(v, 2),
        },
        {
          metrica: "Solicitado por instituição",
          a: lista.length
            ? somar(lista, (i) => i.solicitado) / lista.length
            : 0,
          b: antes.length
            ? somar(antes, (i) => i.solicitado) / antes.length
            : 0,
          fmt: (v: number) => fmtMoeda.format(v),
        },
        {
          metrica: "Concentração dos 5 maiores",
          a: topo5,
          b: concentracao(antes),
          fmt: (v: number) => pct(v),
        },
      ]
    : [];

  return (
    <>
      <div className="kpis">
        <Kpi
          rotulo="Instituições"
          valor={fmtInt.format(lista.length)}
          atual={lista.length}
          anterior={antes.length || undefined}
          anoAnterior={anoAnterior}
          formatar={(v) => fmtInt.format(v)}
        />
        <Kpi
          rotulo="Conveniadas"
          valor={fmtInt.format(conveniadas.length)}
          atual={conveniadas.length}
          anterior={antes.filter((i) => i.conveniada).length || undefined}
          anoAnterior={anoAnterior}
          formatar={(v) => fmtInt.format(v)}
        />
        <Kpi
          rotulo="Recorrentes"
          valor={fmtInt.format(recorrentes.length)}
          nota={`${fmtInt.format(lista.length - recorrentes.length)} novas ou só de um ciclo`}
        />
        <Kpi
          rotulo="Documentação em dia"
          valor={lista.length ? pct(documentadas.length / lista.length) : "—"}
          nota={`${documentadas.length} de ${lista.length} · ${semNenhum.length} sem nada enviado`}
          tom={
            !lista.length
              ? undefined
              : documentadas.length / lista.length > 0.8
                ? "bom"
                : documentadas.length / lista.length > 0.5
                  ? "atencao"
                  : "ruim"
          }
        />
        <Kpi
          rotulo="Concentração (5 maiores)"
          valor={topo5 === null ? "—" : pct(topo5)}
          nota="fatia do solicitado no recorte"
          tom={topo5 === null ? undefined : topo5 > 0.5 ? "atencao" : undefined}
        />
        <Kpi
          rotulo="Solicitado"
          valor={fmtMoedaCurta.format(somar(lista, (i) => i.solicitado))}
          nota={`${fmtMoedaCurta.format(somar(lista, (i) => i.aprovado))} aprovado`}
        />
      </div>

      <div className="grade">
        <Secao
          titulo="Ranking por verba"
          sub="Os 12 maiores pedidos do recorte, por valor solicitado."
        >
          <Barras
            itens={[...lista]
              .sort((a, b) => b.solicitado - a.solicitado)
              .slice(0, 12)
              .map((i) => ({
                chave: i.id,
                rotulo: i.nome,
                valor: i.solicitado,
                texto: `${fmtInt.format(i.projetos)} proj. · ${fmtMoedaCurta.format(i.solicitado)}`,
                cor: i.conveniada ? "var(--azul)" : "var(--azul-claro)",
              }))}
          />
          <p className="rodape">
            Azul escuro = conveniada · azul claro = não conveniada.
          </p>
        </Secao>

        <Secao
          titulo="Conveniadas × não conveniadas"
          sub="A divisão que separa os dois tetos do orçamento."
          largura="dupla"
        >
          <table className="tabela">
            <thead>
              <tr>
                <th>Grupo</th>
                <th className="n">Instituições</th>
                <th className="n">Projetos</th>
                <th className="n">Solicitado</th>
                <th className="n">Aprovado</th>
                <th className="n">Docs em dia</th>
              </tr>
            </thead>
            <tbody>
              {grupos.map((g) => (
                <tr key={g.nome}>
                  <td>{g.nome}</td>
                  <td className="n">{fmtInt.format(g.itens.length)}</td>
                  <td className="n">
                    {fmtInt.format(somar(g.itens, (i) => i.projetos))}
                  </td>
                  <td className="n">
                    {fmtMoeda.format(somar(g.itens, (i) => i.solicitado))}
                  </td>
                  <td className="n">
                    {fmtMoeda.format(somar(g.itens, (i) => i.aprovado))}
                  </td>
                  <td className="n">
                    {g.itens.length
                      ? pct(g.itens.filter(emDia).length / g.itens.length)
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Secao>

        <Secao
          titulo="Documentos pendentes por tipo"
          sub={`${conformidade.tiposExigidos} tipos exigidos de cada instituição — contagem do cadastro inteiro, sem recorte.`}
        >
          <Barras
            itens={conformidade.porTipo.map((t) => ({
              chave: t.tipo,
              rotulo: ROTULO_DOCUMENTO[t.tipo] ?? t.tipo,
              valor: t.pendentes,
              texto: `${fmtInt.format(t.pendentes)} pendentes de ${fmtInt.format(t.total)}`,
              cor: "var(--laranja)",
            }))}
          />
        </Secao>

        <Secao
          titulo="Situação no sistema"
          sub="Derivado da presença da instituição nos ciclos (enriquecimento)."
        >
          <Barras
            itens={situacoes.map(([situacao, n]) => ({
              chave: situacao,
              rotulo: situacao,
              valor: n,
              texto: fmtInt.format(n),
            }))}
          />
        </Secao>

        <Secao
          titulo={`Comparador ${ano} × ${anoAnterior ?? "—"}`}
          sub={
            filtroAtivo
              ? "Os dois ciclos usam os mesmos filtros."
              : "Ciclo inteiro, sem filtros."
          }
        >
          {comparacao.length === 0 ? (
            <p className="sub">Sem ciclo anterior para comparar.</p>
          ) : (
            <table className="tabela">
              <thead>
                <tr>
                  <th>Métrica</th>
                  <th className="n">{ano}</th>
                  <th className="n">{anoAnterior}</th>
                  <th className="n">Δ</th>
                </tr>
              </thead>
              <tbody>
                {comparacao.map((l) => {
                  const d = l.a === null || l.b === null ? null : l.a - l.b;
                  return (
                    <tr key={l.metrica}>
                      <td>{l.metrica}</td>
                      <td className="n">{l.a === null ? "—" : l.fmt(l.a)}</td>
                      <td className="n">{l.b === null ? "—" : l.fmt(l.b)}</td>
                      <td
                        className={`n ${d === null || d === 0 ? "" : d > 0 ? "subiu" : "desceu"}`}
                      >
                        {d === null
                          ? "—"
                          : d === 0
                            ? "="
                            : `${d > 0 ? "+" : "−"}${l.fmt(Math.abs(d))}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Secao>

        <Secao
          titulo="Todas as instituições do recorte"
          sub="Ordenadas por verba aprovada e, sem aprovação no ciclo, por solicitada."
          largura="cheia"
        >
          <div className="rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Instituição</th>
                  <th>Vínculo</th>
                  <th>Situação</th>
                  <th className="n">Parceria</th>
                  <th className="n">Projetos</th>
                  <th className="n">Países</th>
                  <th className="n">Nota</th>
                  <th className="n">Solicitado</th>
                  <th className="n">Aprovado</th>
                  <th className="n">Recebido 2025</th>
                  <th className="n">Documentos</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((i) => (
                  <tr key={i.id}>
                    <td>{i.nome}</td>
                    <td>{i.conveniada ? "Conveniada" : "Não conveniada"}</td>
                    <td>{i.situacao ?? "—"}</td>
                    <td className="n">
                      {i.anosDeParceria === null
                        ? "—"
                        : `${fmtInt.format(i.anosDeParceria)} a`}
                    </td>
                    <td className="n">{fmtInt.format(i.projetos)}</td>
                    <td className="n">{fmtInt.format(i.paises)}</td>
                    <td className="n">{num(i.notaMediana, 1)}</td>
                    <td className="n">{fmtMoeda.format(i.solicitado)}</td>
                    <td className="n">{fmtMoeda.format(i.aprovado)}</td>
                    <td className="n">
                      {i.valorAprovado2025
                        ? fmtMoeda.format(i.valorAprovado2025)
                        : "—"}
                    </td>
                    <td className="n">
                      {i.documentos.total === 0
                        ? "—"
                        : `${i.documentos.enviados}/${i.documentos.total}`}
                      {i.documentos.pendentes > 0 && (
                        <span
                          className="marca-alerta"
                          role="img"
                          aria-label={plural(
                            i.documentos.pendentes,
                            "documento pendente",
                            "documentos pendentes",
                          )}
                          title={plural(
                            i.documentos.pendentes,
                            "documento pendente",
                            "documentos pendentes",
                          )}
                        >
                          {" "}
                          ⚠
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {lista.length === 0 && (
                  <tr>
                    <td colSpan={11} className="sub">
                      Nenhuma instituição com os filtros atuais.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="rodape">
            &quot;Parceria&quot; e as observações de avaliação são colunas
            <b> curadas</b> em <code>data/institution_enrichment.csv</code> —
            seguem vazias até a equipe preencher.
          </p>
        </Secao>
      </div>
    </>
  );
}
