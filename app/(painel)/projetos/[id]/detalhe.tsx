import Link from "next/link";
import type { CSSProperties } from "react";
import type { Anexo, ProjetoDetalhe, RelatorioDetalhe } from "@/lib/types";
import {
  COR_STATUS,
  ROTULO_STATUS,
  fmtMoeda,
  num,
  plural,
} from "../../formato";
import { Secao } from "../../ui";
import { ROTULO_TIPO, Tipo } from "../tipo";

/**
 * A pasta do projeto: tudo o que a origem guarda sobre ele, numa tela só, para
 * ser aberta na TV enquanto o responsável apresenta.
 *
 * O vídeo toca direto do bucket público do Supabase (`<video>` nativo, com
 * Range — testado: 206 num arquivo de 35 MB). Sem player, sem SDK, sem rota de
 * proxy: é a mesma URL que o sistema de submissão já serve.
 */

const fmtData = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });

const data = (d: Date | null) => (d ? fmtData.format(new Date(d)) : "—");

function tamanho(bytes: number | null): string {
  if (!bytes) return "";
  const mb = bytes / 1024 / 1024;
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} kB`;
}

/** Campo de texto longo — some quando a origem não tem o dado. */
function Campo({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  if (!valor?.trim()) return null;
  return (
    <div className="campo-texto">
      <h3>{rotulo}</h3>
      <p>{valor}</p>
    </div>
  );
}

function ListaAnexos({ anexos }: { anexos: Anexo[] }) {
  if (anexos.length === 0) return <p className="sub">Nenhum anexo.</p>;
  return (
    <ul className="anexos">
      {anexos.map((a) => (
        <li key={a.id}>
          {a.url ? (
            <a href={a.url} target="_blank" rel="noopener noreferrer">
              {a.nome}
            </a>
          ) : (
            <span title="Arquivo sem endereço público — falar com a secretaria">
              {a.nome}
            </span>
          )}
          <span className="sub">
            {a.tipo}
            {tamanho(a.bytes) && ` · ${tamanho(a.bytes)}`}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Relatorios({ relatorios }: { relatorios: RelatorioDetalhe[] }) {
  if (relatorios.length === 0) {
    return (
      <p className="sub">
        Nenhum relatório de prestação de contas entregue para este projeto.
      </p>
    );
  }
  return (
    <div className="relatorios">
      {relatorios.map((r) => (
        <article key={r.id} className="relatorio">
          <h3>
            T{r.trimestre}/{r.ano}
            <span className="sub">
              {r.status ?? "sem status"} · enviado em {data(r.enviadoEm)}
            </span>
          </h3>
          <Campo rotulo="Andamento" valor={r.andamento} />
          <Campo rotulo="Objetivos alcançados" valor={r.objetivosAlcancados} />
          <Campo rotulo="Mudanças ou atrasos" valor={r.mudancasOuAtrasos} />
          <Campo rotulo="Notas do revisor" valor={r.notasDoRevisor} />
          {r.anexos.length > 0 && <ListaAnexos anexos={r.anexos} />}
        </article>
      ))}
    </div>
  );
}

export default function Detalhe({ d }: { d: ProjetoDetalhe }) {
  const p = d.projeto;
  const videos = d.anexos.filter((a) => a.ehVideo);
  const arquivos = d.anexos.filter((a) => !a.ehVideo);

  // "Quanto recebeu no ano passado": o valor do projeto casado é o certo; sem
  // vínculo, sobra o total da instituição — e a tela precisa dizer qual é qual.
  const recebido = p.revisao.recebidoAnterior;
  const recebidoInstituicao = p.enriquecimento.valorAprovado2025;

  return (
    <>
      {/* O timbre do papel. Só a pasta sabe o nome do registro aberto, então é
          ela que carimba a linha — o shell não imprime a dele aqui (ver o
          !emDetalhe em shell.tsx), senão o dossiê de um projeto saía intitulado
          "Painel" com o recorte e a contagem de outra página. */}
      <div className="so-impressao">
        <b>{p.titulo}</b>
        <span>Remessa {p.ano}</span>
        <span>{p.instituicaoNome ?? "sem instituição"}</span>
        <span>{p.local.nomePt}</span>
        <span>
          {ROTULO_TIPO[p.revisao.tipo]} · {ROTULO_STATUS[p.statusGrupo]}
        </span>
      </div>

      <div className="cabecalho-projeto cartao">
        <Link className="voltar" href="/projetos">
          ← Projetos &amp; Pastas
        </Link>
        <h1 className="titulo">{p.titulo}</h1>
        <div className="fichas">
          <Tipo revisao={p.revisao} detalhado />
          <span
            className="pastilha-tipo"
            style={{ "--cor": COR_STATUS[p.statusGrupo] } as CSSProperties}
          >
            {ROTULO_STATUS[p.statusGrupo]}
          </span>
          {p.revisao.responsavel && (
            <span className="ficha">
              Pasta de <b>{p.revisao.responsavel}</b>
            </span>
          )}
          {(p.areaSensivel || p.local.sensivel) && (
            <span className="ficha ficha-alerta">Área sensível</span>
          )}
          <span className="ficha ficha-clara">{p.categoria}</span>
          <span className="ficha ficha-clara">
            {p.local.nomePt}
            {p.cidade ? ` · ${p.cidade}` : ""}
          </span>
          <span className="ficha ficha-clara">Remessa {p.ano}</span>
        </div>
        <p className="sub">
          {p.instituicaoNome ?? "sem instituição"}
          {p.conveniada ? " · conveniada" : ""}
          {p.submetidoPor ? ` · submetido por ${p.submetidoPor}` : ""} ·{" "}
          {data(p.submetidoEm)}
        </p>
        {p.revisao.observacoes && (
          <p className="observacao">{p.revisao.observacoes}</p>
        )}
      </div>

      {/*
        Duas camadas, não quatro caixas iguais. Num projeto em avaliação —
        que é o estado normal de todo projeto de 2026 no dia da reunião — três
        das quatro caixas antigas liam "—" em 30px, e a frase que de fato
        informava ficava em 12,5px cinza embaixo. Aqui a ausência É a frase.
      */}
      <section className="valores">
        <h2 className="titulo">Valores e avaliação</h2>
        <div className="valor-principal cartao">
          <div className="kpi-rotulo">Solicitado</div>
          <div className="kpi-valor">{fmtMoeda.format(p.solicitado)}</div>
          <div className="kpi-delta">
            {p.duracaoMeses
              ? plural(p.duracaoMeses, "mês", "meses")
              : "duração não informada"}
            {p.numeroParcelas
              ? ` · ${plural(p.numeroParcelas, "parcela", "parcelas")}`
              : ""}
          </div>
        </div>
        <dl className="identificacao cartao">
          <div>
            <dt>Aprovado</dt>
            <dd className={p.aprovado === null ? "ausente" : undefined}>
              {p.aprovado === null
                ? "Ainda em avaliação — nada decidido neste ciclo"
                : `${fmtMoeda.format(p.aprovado)}${
                    p.liberado
                      ? ` · ${fmtMoeda.format(p.liberado)} liberados`
                      : ""
                  }`}
            </dd>
          </div>
          <div>
            <dt>
              Recebeu{" "}
              {d.anterior ? `em ${d.anterior.ano}` : "no ciclo anterior"}
            </dt>
            <dd className={recebido === null ? "ausente" : undefined}>
              {recebido !== null
                ? `${fmtMoeda.format(recebido)} — deste mesmo projeto`
                : recebidoInstituicao
                  ? `Projeto novo — a instituição recebeu ${fmtMoeda.format(recebidoInstituicao)}`
                  : "Projeto e instituição sem verba no ciclo anterior"}
            </dd>
          </div>
          <div>
            <dt>Nota mediana</dt>
            <dd className={p.avaliacoes === 0 ? "ausente" : undefined}>
              {p.avaliacoes === 0
                ? "Chega ao voto sem nenhuma avaliação registrada"
                : `${num(p.notaMediana)} · ${plural(p.avaliacoes, "avaliação", "avaliações")} · ${p.votosAprovacao} a favor`}
            </dd>
          </div>
        </dl>
      </section>

      <div className="grade">
        <Secao titulo="Anexos" sub="Abrem em nova aba, direto do sistema.">
          <ListaAnexos anexos={arquivos} />
        </Secao>

        <Secao
          titulo="Parecer da equipe ASEEC"
          sub="Análise da secretaria, registrada antes da reunião."
        >
          {d.parecerTags.length > 0 && (
            <div className="fichas">
              {d.parecerTags.map((t) => (
                <span key={t} className="ficha ficha-clara">
                  {t}
                </span>
              ))}
            </div>
          )}
          <Campo rotulo="Parecer" valor={d.parecerTexto} />
          <Campo rotulo="Notas do revisor" valor={d.notasDoRevisor} />
          {!d.parecerTexto &&
            !d.notasDoRevisor &&
            d.parecerTags.length === 0 && (
              <p className="sub">
                A equipe ainda não registrou parecer — este projeto chega à
                reunião sem análise prévia da secretaria.
              </p>
            )}
        </Secao>

        <Secao titulo="O projeto" largura="cheia">
          <Campo rotulo="Descrição" valor={d.descricao} />
          <Campo rotulo="Justificativa" valor={d.justificativa} />
          <Campo rotulo="Resultados esperados" valor={d.resultadosEsperados} />
          <Campo rotulo="Metodologia" valor={d.metodologia} />
          <Campo rotulo="Natureza" valor={d.natureza} />
          <Campo rotulo="Parcerias" valor={d.parcerias} />
          {d.redeSocial && (
            <div className="campo-texto">
              <h3>Rede social</h3>
              <p>
                {/^https?:\/\//i.test(d.redeSocial) ? (
                  <a
                    href={d.redeSocial}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {d.redeSocial}
                  </a>
                ) : (
                  d.redeSocial
                )}
              </p>
            </div>
          )}
          <p className="sub">
            Início {data(d.inicio)} · fim {data(d.fim)} · criado{" "}
            {data(d.criadoEm)} · atualizado {data(d.atualizadoEm)}
            {p.mesesParcelas?.length
              ? ` · parcelas nos meses ${p.mesesParcelas.join(", ")}`
              : ""}
          </p>
        </Secao>

        {/* Depois do mérito, e não antes: o vídeo é o único elemento da pasta
            que não se lê no papel nem se acompanha a três metros sem som. */}
        {videos.length > 0 && (
          <Secao
            titulo={
              videos.length > 1
                ? "Vídeos de apresentação"
                : "Vídeo de apresentação"
            }
            sub="Enviado pela instituição junto da proposta."
            largura="cheia"
          >
            <div className="videos">
              {videos.map((v) => (
                <figure key={v.id}>
                  {/* preload=metadata: na reunião não dá para baixar 35 MB de
                      cada vídeo da pasta antes de alguém apertar o play.
                      Sem legendas: os arquivos vêm das instituições e a origem
                      não guarda faixa de legenda para nenhum deles. */}
                  <video
                    controls
                    preload="metadata"
                    src={v.url}
                    title={`Vídeo de apresentação — ${p.titulo}`}
                  />
                  <figcaption className="sub">
                    {v.nome}
                    {tamanho(v.bytes) && ` · ${tamanho(v.bytes)}`}
                    <span className="so-impressao-inline">
                      {" "}
                      · vídeo não reproduzível no papel
                    </span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </Secao>
        )}

        {d.indicadores.length > 0 && (
          <Secao titulo="Indicadores">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Indicador</th>
                  <th>Meta</th>
                </tr>
              </thead>
              <tbody>
                {d.indicadores.map((i, n) => (
                  <tr key={n}>
                    <td>{i.nome ?? "—"}</td>
                    <td>{i.meta ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Secao>
        )}

        {d.equipe.length > 0 && (
          <Secao titulo="Equipe">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Função</th>
                  <th>Contato</th>
                </tr>
              </thead>
              <tbody>
                {d.equipe.map((m, n) => (
                  <tr key={n}>
                    <td>{m.nome ?? "—"}</td>
                    <td>{m.funcao ?? "—"}</td>
                    <td>{m.contato ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Secao>
        )}

        {d.anterior && (
          <Secao
            titulo={`Renovação — o que foi a Remessa ${d.anterior.ano}`}
            sub="É isto que a equipe ASEEC analisa numa renovação: o que foi aprovado e como foi prestado."
            largura="cheia"
          >
            <p>
              <Link
                className="link-projeto"
                href={`/projetos/${d.anterior.id}`}
              >
                {d.anterior.titulo}
              </Link>{" "}
              <span className="sub">
                · {d.anterior.status} · solicitou{" "}
                {fmtMoeda.format(d.anterior.solicitado)} · aprovado{" "}
                {d.anterior.aprovado === null
                  ? "—"
                  : fmtMoeda.format(d.anterior.aprovado)}
                {d.anterior.liberado
                  ? ` · liberado ${fmtMoeda.format(d.anterior.liberado)}`
                  : ""}
              </span>
            </p>
            <Relatorios relatorios={d.anterior.relatorios} />
          </Secao>
        )}

        {d.relatorios.length > 0 && (
          <Secao titulo="Prestação de contas deste projeto" largura="cheia">
            <Relatorios relatorios={d.relatorios} />
          </Secao>
        )}

        <Secao
          titulo="Avaliações"
          sub="Nota e comentário de cada conselheiro. As notas são infladas no histórico — leia o comentário."
          largura="cheia"
        >
          {d.avaliacoesDetalhe.length === 0 ? (
            <p className="sub">
              Nenhuma avaliação registrada — não há nota nem comentário de
              conselheiro para embasar o voto deste projeto.
            </p>
          ) : (
            <div className="rolagem">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Avaliador</th>
                    <th className="n">Nota</th>
                    <th>Aprova?</th>
                    <th>Comentário</th>
                    <th>Enviada</th>
                  </tr>
                </thead>
                <tbody>
                  {d.avaliacoesDetalhe.map((a, n) => (
                    <tr key={n}>
                      <td>
                        {a.avaliador}
                        {a.papel && <span className="sub"> · {a.papel}</span>}
                      </td>
                      <td className="n">{num(a.nota)}</td>
                      <td>
                        {a.aprovou === null ? "—" : a.aprovou ? "Sim" : "Não"}
                      </td>
                      <td>{a.comentario ?? "—"}</td>
                      <td>{data(a.enviadaEm)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Secao>

        {d.votos.length > 0 && (
          <Secao
            titulo={`Votos por critério — ${plural(d.votos.length, "voto", "votos")}`}
            largura="cheia"
          >
            <div className="rolagem">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Critério</th>
                    <th>Tipo</th>
                    <th>Avaliador</th>
                    <th>Voto</th>
                    <th className="n">Pontos</th>
                    <th>Comentário</th>
                  </tr>
                </thead>
                <tbody>
                  {d.votos.map((v, n) => (
                    <tr key={n}>
                      {/* `criterioChave` é chave de máquina: quando é tudo o
                          que a origem tem, sai marcada como tal em vez de
                          passar por nome de critério. */}
                      <td>
                        {v.criterio ??
                          (v.criterioChave ? (
                            <span className="sub">
                              sem nome no sistema ({v.criterioChave})
                            </span>
                          ) : (
                            "—"
                          ))}
                      </td>
                      <td>{v.tipo}</td>
                      <td>{v.avaliador}</td>
                      <td>{v.valor ?? "—"}</td>
                      <td className="n">{v.pontuacao ?? "—"}</td>
                      <td>{v.comentario ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Secao>
        )}

        {d.instituicao && (
          <Secao titulo="Instituição">
            {/* <dl>, não <table>: são pares rótulo–valor, e como tabela isto
                usava <th> dentro do <tbody> sem `scope`. */}
            <dl className="identificacao">
              <div>
                <dt>Nome</dt>
                <dd>{d.instituicao.nome}</dd>
              </div>
              <div>
                <dt>CNPJ</dt>
                <dd>{d.instituicao.cnpj ?? "—"}</dd>
              </div>
              <div>
                <dt>Conveniada</dt>
                <dd>{d.instituicao.conveniada ? "Sim" : "Não"}</dd>
              </div>
              <div>
                <dt>Responsável</dt>
                <dd>{d.instituicao.contato ?? "—"}</dd>
              </div>
              <div>
                <dt>Contato</dt>
                <dd>
                  {[d.instituicao.email, d.instituicao.telefone]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </dd>
              </div>
              <div>
                <dt>Situação cadastral</dt>
                <dd>{p.enriquecimento.situacaoNoSistema ?? "—"}</dd>
              </div>
            </dl>
          </Secao>
        )}

        {d.historico.length > 0 && (
          <Secao titulo="Histórico de status">
            <ul className="historico">
              {d.historico.map((h, n) => (
                <li key={n}>
                  <b>{h.para}</b>
                  <span className="sub">
                    {h.de ? `de ${h.de} · ` : ""}
                    {data(h.em)}
                    {h.por ? ` · ${h.por}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </Secao>
        )}
      </div>
    </>
  );
}
