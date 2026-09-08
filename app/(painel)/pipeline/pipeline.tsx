"use client";

import { useMemo } from "react";
import { agrupar, estatisticaNota, grupoDeStatus } from "@/lib/agregar";
import type { AvaliacoesCiclo, ProjetoCiclo } from "@/lib/types";
import { alternar, usePainel } from "../contexto";
import {
  COR_STATUS,
  ORDEM_STATUS,
  ROTULO_STATUS,
  fmtInt,
  fmtMoedaCurta,
  num,
  pct,
} from "../formato";
import { Barras, Kpi, Secao } from "../ui";

/**
 * Pipeline & Avaliação — onde os projetos estão parados e o que as notas dizem.
 *
 * Duas óticas convivem de propósito:
 *  - por PROJETO (nota mediana do projeto): reagrega com os filtros do painel;
 *  - por AVALIAÇÃO (`dados.avaliacoes`): visão do ciclo inteiro, usada para o
 *    comportamento dos conselheiros — filtrar por continente ali não faria
 *    sentido e esconderia a inflação de notas, que é justamente o que se quer ver.
 */

/** Faixas do histograma de notas — 10,0 isolado, porque é o sintoma da inflação. */
const FAIXAS: { rotulo: string; dentro: (n: number) => boolean }[] = [
  { rotulo: "< 6,0", dentro: (n) => n < 6 },
  { rotulo: "6,0 – 6,9", dentro: (n) => n >= 6 && n < 7 },
  { rotulo: "7,0 – 7,9", dentro: (n) => n >= 7 && n < 8 },
  { rotulo: "8,0 – 8,9", dentro: (n) => n >= 8 && n < 9 },
  { rotulo: "9,0 – 9,9", dentro: (n) => n >= 9 && n < 10 },
  { rotulo: "10,0 (nota máxima)", dentro: (n) => n >= 10 },
];

const notasDe = (ps: ProjetoCiclo[]) =>
  ps.map((p) => p.notaMediana).filter((v): v is number => v !== null);

export default function Pipeline({
  avaliacoes,
}: {
  avaliacoes: Record<number, AvaliacoesCiclo>;
}) {
  const {
    ano,
    anoAnterior,
    projetos,
    projetosAnteriores,
    filtros,
    filtroAtivo,
    aplicar,
  } = usePainel();

  const nota = useMemo(() => estatisticaNota(notasDe(projetos)), [projetos]);
  const notaAntes = useMemo(
    () => estatisticaNota(notasDe(projetosAnteriores)),
    [projetosAnteriores],
  );

  const totalAvaliacoes = projetos.reduce((s, p) => s + p.avaliacoes, 0);
  const totalVotosSim = projetos.reduce((s, p) => s + p.votosAprovacao, 0);
  const semAvaliacao = projetos.filter((p) => p.avaliacoes === 0);
  const emAvaliacao = projetos.filter((p) => p.statusGrupo === "em-avaliacao");

  // Funil detalhado: status BRUTO da origem, na ordem semântica do grupo.
  const funilDetalhado = useMemo(() => {
    const grupos = agrupar(projetos, (p) => p.status);
    return [...grupos.entries()]
      .map(([status, lista]) => ({
        status,
        grupo: grupoDeStatus(status),
        projetos: lista.length,
        solicitado: lista.reduce((s, p) => s + p.solicitado, 0),
      }))
      .sort(
        (a, b) =>
          ORDEM_STATUS.indexOf(a.grupo) - ORDEM_STATUS.indexOf(b.grupo) ||
          b.projetos - a.projetos,
      );
  }, [projetos]);

  const histograma = useMemo(() => {
    const notas = notasDe(projetos);
    return FAIXAS.map((f) => ({
      chave: f.rotulo,
      rotulo: f.rotulo,
      valor: notas.filter((n) => f.dentro(n)).length,
      texto: fmtInt.format(notas.filter((n) => f.dentro(n)).length),
      cor: f.rotulo.startsWith("10,0") ? "var(--laranja)" : "var(--azul)",
    }));
  }, [projetos]);

  const porCategoria = useMemo(
    () =>
      [...agrupar(projetos, (p) => p.categoria).entries()]
        .map(([categoria, lista]) => ({
          categoria,
          projetos: lista.length,
          ...estatisticaNota(notasDe(lista)),
        }))
        .sort((a, b) => b.projetos - a.projetos),
    [projetos],
  );

  const doCiclo = avaliacoes[ano];

  return (
    <>
      <div className="kpis">
        <Kpi
          rotulo="Em avaliação"
          valor={fmtInt.format(emAvaliacao.length)}
          nota={`${pct(projetos.length ? emAvaliacao.length / projetos.length : 0)} do recorte`}
        />
        <Kpi
          rotulo="Avaliações registradas"
          valor={fmtInt.format(totalAvaliacoes)}
          nota={`${num(projetos.length ? totalAvaliacoes / projetos.length : 0, 1)} por projeto`}
        />
        <Kpi
          rotulo="Nota mediana"
          valor={num(nota.mediana, 2)}
          atual={nota.mediana ?? undefined}
          anterior={notaAntes.mediana}
          anoAnterior={anoAnterior}
          formatar={(v) => num(v, 2)}
          nota="nenhum projeto avaliado no recorte"
        />
        <Kpi
          rotulo="Projetos com nota 10,0"
          valor={
            nota.fracaoNotaMaxima === null ? "—" : pct(nota.fracaoNotaMaxima)
          }
          nota="sinal de inflação de nota"
          tom={
            nota.fracaoNotaMaxima === null
              ? undefined
              : nota.fracaoNotaMaxima > 0.5
                ? "ruim"
                : nota.fracaoNotaMaxima > 0.3
                  ? "atencao"
                  : "bom"
          }
        />
        <Kpi
          rotulo="Votos favoráveis"
          valor={pct(totalAvaliacoes ? totalVotosSim / totalAvaliacoes : 0)}
          nota={`${fmtInt.format(totalVotosSim)} de ${fmtInt.format(totalAvaliacoes)} votos`}
        />
        <Kpi
          rotulo="Sem nenhuma avaliação"
          valor={fmtInt.format(semAvaliacao.length)}
          nota={
            semAvaliacao.length ? "pendente de conselheiro" : "todos avaliados"
          }
          tom={semAvaliacao.length ? "atencao" : "bom"}
        />
      </div>

      <div className="grade">
        <Secao
          titulo="Funil detalhado"
          sub="Status como está na origem, agrupado pela paleta semântica."
        >
          <Barras
            itens={funilDetalhado.map((f) => ({
              chave: f.status,
              rotulo: f.status,
              valor: f.projetos,
              texto: `${fmtInt.format(f.projetos)} · ${fmtMoedaCurta.format(f.solicitado)}`,
              cor: COR_STATUS[f.grupo],
              ativo: filtros.status.includes(f.grupo),
              aoClicar: () =>
                aplicar({ status: alternar(filtros.status, f.grupo) }),
            }))}
          />
          <p className="rodape">
            O clique filtra pelo <b>grupo</b> da paleta (Em avaliação, Aprovado
            …), não pelo status individual.
          </p>
        </Secao>

        <Secao
          titulo="Distribuição das notas"
          sub="Nota mediana de cada projeto do recorte atual."
          largura="dupla"
        >
          <Barras itens={histograma} />
          <p className="rodape">
            Mediana {num(nota.mediana, 2)} · média {num(nota.media, 2)} ·
            intervalo interquartil {num(nota.p25, 2)}–{num(nota.p75, 2)} ·
            desvio {num(nota.desvio, 2)} ({fmtInt.format(nota.n)} projetos com
            nota).
          </p>
        </Secao>

        <Secao
          titulo="Notas por categoria"
          sub={
            filtroAtivo
              ? "Segue os filtros do painel."
              : "Ciclo inteiro, por projeto."
          }
          largura="cheia"
        >
          <table className="tabela">
            <thead>
              <tr>
                <th>Categoria</th>
                <th className="n">Projetos</th>
                <th className="n">Com nota</th>
                <th className="n">Mediana</th>
                <th className="n">Média</th>
                <th className="n">p25 – p75</th>
                <th className="n">% 10,0</th>
              </tr>
            </thead>
            <tbody>
              {porCategoria.map((c) => (
                <tr key={c.categoria}>
                  <td>{c.categoria}</td>
                  <td className="n">{fmtInt.format(c.projetos)}</td>
                  <td className="n">{fmtInt.format(c.n)}</td>
                  <td className="n">{num(c.mediana, 2)}</td>
                  <td className="n">{num(c.media, 2)}</td>
                  <td className="n">
                    {num(c.p25, 1)} – {num(c.p75, 1)}
                  </td>
                  <td className="n">
                    {c.fracaoNotaMaxima === null
                      ? "—"
                      : pct(c.fracaoNotaMaxima)}
                  </td>
                </tr>
              ))}
              {porCategoria.length === 0 && (
                <tr>
                  <td colSpan={7} className="sub">
                    Nenhum projeto com os filtros atuais.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Secao>

        <Secao
          titulo="Conselheiros"
          sub={`Todas as ${fmtInt.format(doCiclo?.geral.n ?? 0)} avaliações da Remessa ${ano} — visão do ciclo inteiro, não segue os filtros.`}
          largura="cheia"
        >
          <table className="tabela">
            <thead>
              <tr>
                <th>Conselheiro</th>
                <th className="n">Avaliações</th>
                <th className="n">Mediana</th>
                <th className="n">Média</th>
                <th className="n">Desvio</th>
                <th className="n">Mín – máx</th>
                <th>% de notas 10,0</th>
              </tr>
            </thead>
            <tbody>
              {(doCiclo?.porConselheiro ?? []).map((c) => (
                <tr key={c.conselheiroId}>
                  <td>{c.conselheiro}</td>
                  <td className="n">{fmtInt.format(c.n)}</td>
                  <td className="n">{num(c.mediana, 2)}</td>
                  <td className="n">{num(c.media, 2)}</td>
                  <td className="n">{num(c.desvio, 2)}</td>
                  <td className="n">
                    {num(c.min, 1)} – {num(c.max, 1)}
                  </td>
                  <td>
                    <span className="barra barra-inline">
                      <i
                        style={{
                          width: `${(c.fracaoNotaMaxima ?? 0) * 100}%`,
                          background:
                            (c.fracaoNotaMaxima ?? 0) > 0.7
                              ? "var(--laranja)"
                              : "var(--azul-claro)",
                        }}
                      />
                    </span>
                    <span className="n-inline">
                      {c.fracaoNotaMaxima === null
                        ? "—"
                        : pct(c.fracaoNotaMaxima)}
                    </span>
                  </td>
                </tr>
              ))}
              {!doCiclo?.porConselheiro.length && (
                <tr>
                  <td colSpan={7} className="sub">
                    Nenhuma avaliação registrada neste ciclo.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Secao>

        {semAvaliacao.length > 0 && (
          <Secao
            titulo="Sem avaliação"
            sub="Projetos do recorte que ainda não receberam nenhuma nota."
            largura="cheia"
          >
            <table className="tabela">
              <thead>
                <tr>
                  <th>Projeto</th>
                  <th>Instituição</th>
                  <th>País</th>
                  <th>Status</th>
                  <th className="n">Solicitado</th>
                </tr>
              </thead>
              <tbody>
                {semAvaliacao.slice(0, 15).map((p) => (
                  <tr key={p.id}>
                    <td>{p.titulo}</td>
                    <td>{p.instituicaoNome ?? "—"}</td>
                    <td>{p.local.nomePt}</td>
                    <td>
                      <span
                        className="pastilha"
                        style={{ background: COR_STATUS[p.statusGrupo] }}
                      >
                        {ROTULO_STATUS[p.statusGrupo]}
                      </span>
                    </td>
                    <td className="n">{fmtMoedaCurta.format(p.solicitado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {semAvaliacao.length > 15 && (
              <p className="rodape">
                … e mais {fmtInt.format(semAvaliacao.length - 15)} projeto(s).
              </p>
            )}
          </Secao>
        )}
      </div>
    </>
  );
}
