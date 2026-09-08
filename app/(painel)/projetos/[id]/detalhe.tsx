import Link from "next/link";
import type { Anexo, ProjetoDetalhe, RelatorioDetalhe } from "@/lib/types";
import {
  COR_STATUS,
  ROTULO_STATUS,
  fmtInt,
  fmtMoeda,
  num,
} from "../../formato";
import { Secao } from "../../ui";
import { Tipo } from "../tipo";

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
            <span title="Sem SUPABASE_URL/IP_HOST no .env.local">{a.nome}</span>
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
      <div className="cabecalho-projeto cartao">
        <Link className="voltar" href="/projetos">
          ← Projetos &amp; Pastas
        </Link>
        <h1 className="titulo">{p.titulo}</h1>
        <div className="fichas">
          <Tipo revisao={p.revisao} />
          <span
            className="pastilha-tipo"
            style={{ background: COR_STATUS[p.statusGrupo] }}
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

      <div className="kpis">
        <div className="kpi cartao">
          <div className="kpi-rotulo">Solicitado</div>
          <div className="kpi-valor">{fmtMoeda.format(p.solicitado)}</div>
          <div className="kpi-delta">
            {p.duracaoMeses
              ? `${p.duracaoMeses} meses`
              : "duração não informada"}
            {p.numeroParcelas ? ` · ${p.numeroParcelas} parcelas` : ""}
          </div>
        </div>
        <div className="kpi cartao">
          <div className="kpi-rotulo">Aprovado</div>
          <div className="kpi-valor">
            {p.aprovado === null ? "—" : fmtMoeda.format(p.aprovado)}
          </div>
          <div className="kpi-delta">
            {p.liberado
              ? `${fmtMoeda.format(p.liberado)} liberados`
              : "ainda em avaliação"}
          </div>
        </div>
        <div className={`kpi cartao${recebido === null ? "" : " kpi-bom"}`}>
          <div className="kpi-rotulo">
            Recebeu {d.anterior ? `em ${d.anterior.ano}` : "no ciclo anterior"}
          </div>
          <div className="kpi-valor">
            {recebido === null ? "—" : fmtMoeda.format(recebido)}
          </div>
          <div className="kpi-delta">
            {recebido !== null
              ? "deste mesmo projeto"
              : recebidoInstituicao
                ? `projeto novo · a instituição recebeu ${fmtMoeda.format(recebidoInstituicao)}`
                : "projeto e instituição sem verba no ciclo anterior"}
          </div>
        </div>
        <div className="kpi cartao">
          <div className="kpi-rotulo">Nota mediana</div>
          <div className="kpi-valor">{num(p.notaMediana)}</div>
          <div className="kpi-delta">
            {p.avaliacoes} avaliação(ões) · {p.votosAprovacao} a favor
          </div>
        </div>
      </div>

      {videos.length > 0 && (
        <Secao
          titulo={
            videos.length > 1
              ? "Vídeos de apresentação"
              : "Vídeo de apresentação"
          }
          sub="Toca direto do repositório de arquivos do sistema de submissão."
          largura="cheia"
        >
          <div className="videos">
            {videos.map((v) => (
              <figure key={v.id}>
                {/* preload=metadata: na reunião não dá para baixar 35 MB de
                    cada vídeo da pasta antes de alguém apertar o play. */}
                <video controls preload="metadata" src={v.url} />
                <figcaption className="sub">
                  {v.nome}
                  {tamanho(v.bytes) && ` · ${tamanho(v.bytes)}`}
                </figcaption>
              </figure>
            ))}
          </div>
        </Secao>
      )}

      <div className="grade">
        <Secao titulo="Anexos" sub="Abrem em nova aba, direto do sistema.">
          <ListaAnexos anexos={arquivos} />
        </Secao>

        <Secao
          titulo="Parecer da equipe ASEEC"
          sub="Campos `parecer_aseec_*` e `reviewer_notes` do projeto."
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
              <p className="sub">A equipe ainda não registrou parecer.</p>
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
            <p className="sub">Nenhuma avaliação registrada.</p>
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
            titulo={`Votos por critério (${fmtInt.format(d.votos.length)})`}
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
                      <td>{v.criterio ?? v.criterioChave ?? "—"}</td>
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
            <table className="tabela">
              <tbody>
                <tr>
                  <th>Nome</th>
                  <td>{d.instituicao.nome}</td>
                </tr>
                <tr>
                  <th>CNPJ</th>
                  <td>{d.instituicao.cnpj ?? "—"}</td>
                </tr>
                <tr>
                  <th>Conveniada</th>
                  <td>{d.instituicao.conveniada ? "Sim" : "Não"}</td>
                </tr>
                <tr>
                  <th>Responsável</th>
                  <td>{d.instituicao.contato ?? "—"}</td>
                </tr>
                <tr>
                  <th>Contato</th>
                  <td>
                    {[d.instituicao.email, d.instituicao.telefone]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </td>
                </tr>
                <tr>
                  <th>Situação no sistema</th>
                  <td>{p.enriquecimento.situacaoNoSistema ?? "—"}</td>
                </tr>
              </tbody>
            </table>
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
