import Link from "next/link";
import type { Decisao } from "@/lib/decisao";
import { ehHtmlRico, sanitizarHtml } from "@/lib/html";
import type { Anexo, ProjetoDetalhe, RelatorioDetalhe } from "@/lib/types";
import {
  fmtMoeda,
  num,
  plural,
  rotuloCategoria,
  rotuloStatus,
  tamanhoArquivo,
  variacaoPedido,
} from "../../formato";
import { Secao } from "../../ui";
import { procedencia, ROTULO_TIPO } from "../tipo";
import Barra from "./barra";
import DecisaoPainel from "./decisao";
import EditarTriagem from "./triagem";
import LinkPrestacao from "./link-prestacao";
import ListaAnexos from "./visor";

/**
 * A pasta do projeto: tudo o que a origem guarda sobre ele, numa tela só, para
 * ser aberta na TV enquanto o responsável apresenta.
 *
 * A ordem da página é a ordem das perguntas da reunião, e não a ordem das
 * tabelas da origem:
 *
 *  1. quanto pede, quanto recebeu, o que já foi decidido  → `.valores`
 *  2. se é renovação, o que fez com o dinheiro do ano passado
 *  3. o que a secretaria achou (quando achou)
 *  4. o mérito — descrição, justificativa, resultados, metodologia
 *  5. vídeo, prestação deste ciclo, avaliações e votos
 *  6. o registro (indicadores, equipe, cadastro, histórico), que não decide nada
 *
 * O que a origem não tem NÃO vira cartão vazio: em 2026 o parecer da ASEEC
 * existe em 32 dos 266 projetos e não há uma única avaliação registrada — a
 * grade abria com um cartão dizendo "ainda não registrado" em quase todo
 * projeto. Essas ausências viraram uma linha na ficha de valores, que é onde
 * a mesa lê os números, e as seções só aparecem quando têm conteúdo.
 *
 * O vídeo toca direto do bucket público do Supabase (`<video>` nativo, com
 * Range — testado: 206 num arquivo de 35 MB). Sem player, sem SDK, sem rota de
 * proxy: é a mesma URL que o sistema de submissão já serve.
 */

const fmtData = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });

const data = (d: Date | null) => (d ? fmtData.format(new Date(d)) : "sem data");

/** Célula vazia é frase, como na ficha de valores: um "—" não diz se é zero,
    se não se aplica ou se a origem não tem. */
const NI = "não informado";

/**
 * Campo de texto longo — some quando a origem não tem o dado.
 *
 * Alguns campos vêm como HTML de editor (todo parecer da ASEEC, e a
 * justificativa de 5 projetos): esses são desenhados de verdade, depois de
 * passar pela lista de permissão de `sanitizarHtml`. O resto continua no
 * caminho de texto do React, que escapa sozinho — jogar texto puro no
 * `innerHTML` faria "R$ 5 < 10" e "M&M" sumirem da tela.
 */
function Campo({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  if (!valor?.trim()) return null;
  return (
    <div className="campo-texto">
      <h3>{rotulo}</h3>
      {ehHtmlRico(valor) ? (
        <div
          className="texto-rico"
          // O <p> da origem não pode morar dentro de outro <p>: o navegador
          // quebraria a caixa em pedaços. Daí a div.
          dangerouslySetInnerHTML={{ __html: sanitizarHtml(valor) }}
        />
      ) : (
        <p>{valor}</p>
      )}
    </div>
  );
}

/**
 * A prestação que existe só no Drive. Vai numa lista à parte, e não misturada
 * com os relatórios: uma coisa é o que o parceiro registrou no sistema, outra é
 * o arquivo que a secretaria recebeu por fora e colou aqui.
 */
function LinksDrive({ links }: { links: Anexo[] }) {
  if (links.length === 0) return null;
  return (
    <div className="campo-texto">
      <h3>Recebido fora do sistema</h3>
      <ListaAnexos anexos={links} />
    </div>
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

export default function Detalhe({
  d,
  decisao,
  totalEnvelopes,
  triagem,
}: {
  d: ProjetoDetalhe;
  decisao: Decisao | null;
  /** Soma do mês a mês ajustado na tela de Envelopes (null = sem ajuste). */
  totalEnvelopes: number | null;
  triagem: {
    avaliadores: string[];
    anteriores: { id: string; titulo: string }[];
  };
}) {
  const p = d.projeto;
  const videos = d.anexos.filter((a) => a.ehVideo);
  const arquivos = d.anexos.filter((a) => !a.ehVideo);

  // "Quanto recebeu no ano passado": o valor do projeto casado é o certo; sem
  // vínculo, sobra o total da instituição — e a tela precisa dizer qual é qual.
  const recebido = p.revisao.recebidoAnterior;
  const anoAnterior = d.anterior?.ano ?? p.ano - 1;
  // O total da instituição vem de `valorAprovado2025` (enriquecimento): só é
  // "o ciclo anterior" na remessa 2026. Numa pasta de 2025 ele é o ciclo
  // corrente e soma o próprio projeto, então ali não entra.
  const recebidoInstituicao =
    p.ano === 2026 ? p.enriquecimento.valorAprovado2025 : null;
  const variacao = variacaoPedido(p.solicitado, recebido);
  const ressalvaTriagem = procedencia(p.revisao);
  // Sem vínculo de valor, quem diz se o projeto é novo é a triagem, não a
  // ausência do número: 54 projetos de 2026 estão "a revisar".
  const clausulaTriagem = {
    novo: "Este projeto é novo.",
    revisar: `Vínculo deste projeto com ${anoAnterior} a revisar.`,
    renovacao: "Renovação sem valor vinculado.",
  }[p.revisao.tipo];

  const temParecer =
    !!d.parecerTexto || !!d.notasDoRevisor || d.parecerTags.length > 0;

  // Renovação de projeto que de fato recebeu verba: aí a falta de relatório é
  // cobrança em aberto, e não a consequência normal de não ter sido aprovado.
  const anteriorRecebeu =
    (d.anterior?.liberado ?? d.anterior?.aprovado ?? 0) > 0;

  return (
    <div className="pasta-projeto">
      <Barra
        id={p.id}
        titulo={p.titulo}
        solicitado={p.solicitado}
        temVideo={videos.length > 0}
      />

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
          {ROTULO_TIPO[p.revisao.tipo]} · {rotuloStatus(p.status)}
        </span>
      </div>

      <div className="cabecalho-projeto cartao">
        <h1 className="titulo">{p.titulo}</h1>
        {/* Cada fato com o seu rótulo, no lugar de oito pastilhas. A triagem e
            a análise prévia são o que a equipe decidiu antes da reunião; a
            ressalva do casamento de título vai escrita (ninguém passa o mouse
            na TV, e tooltip não existe no papel). A remessa já está no seletor
            do topo e no timbre impresso. */}
        <dl className="classificacao">
          <div>
            <dt>Triagem</dt>
            <dd>
              {ROTULO_TIPO[p.revisao.tipo]}
              {ressalvaTriagem && <small> · {ressalvaTriagem}</small>}
            </dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{rotuloStatus(p.status)}</dd>
          </div>
          {/* A análise prévia não entra aqui: com parecer ou tags, o bloco
              "Parecer" logo abaixo é ela; sem, a ficha de valores já diz
              "Parecer da ASEEC: não registrado". */}
          {p.revisao.responsavel && (
            <div>
              <dt>Pasta de</dt>
              <dd>{p.revisao.responsavel}</dd>
            </div>
          )}
          <div>
            <dt>Categoria</dt>
            <dd>{rotuloCategoria(p.categoria)}</dd>
          </div>
          <div>
            <dt>Local</dt>
            <dd>
              {p.local.nomePt}
              {p.cidade ? ` · ${p.cidade}` : ""}
            </dd>
          </div>
          {(p.areaSensivel || p.local.sensivel) && (
            <div>
              <dt>Atenção</dt>
              <dd>
                <span className="ficha ficha-alerta">Área sensível</span>
              </dd>
            </div>
          )}
        </dl>
        <p className="proponente">
          <b>{p.instituicaoNome ?? "sem instituição"}</b>
          {p.conveniada ? " · Conveniada" : ""}
          <span className="sub">
            {p.submetidoPor
              ? `submetido por ${p.submetidoPor} · `
              : "submetido "}
            {data(p.submetidoEm)}
          </span>
        </p>
        {p.revisao.observacoes && (
          <p className="observacao">{p.revisao.observacoes}</p>
        )}
        <EditarTriagem key={p.id} id={p.id} revisao={p.revisao} {...triagem} />
      </div>

      {/*
        Duas camadas, não quatro caixas iguais. Num projeto em avaliação —
        que é o estado normal de todo projeto de 2026 no dia da reunião — três
        das quatro caixas antigas liam "—" em 30px, e a frase que de fato
        informava ficava em 12,5px cinza embaixo. Aqui a ausência É a frase.
      */}
      <section className="valores">
        <h2 className="titulo faixa-titulo">Valores e avaliação</h2>
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
                ? "Ainda em avaliação: nada decidido neste ciclo"
                : `${fmtMoeda.format(p.aprovado)}${
                    p.liberado
                      ? ` · ${fmtMoeda.format(p.liberado)} liberados`
                      : ""
                  }`}
            </dd>
          </div>
          {/* key: trocar de projeto pelas setas não pode herdar o formulário
              (nem o valor digitado) do projeto anterior. */}
          <DecisaoPainel
            key={p.id}
            alvo={{ id: p.id, ano: p.ano, titulo: p.titulo }}
            decisao={decisao}
            totalEnvelopes={totalEnvelopes}
          />
          <div>
            {/* Rótulo e valor têm que falar do mesmo sujeito: sem vínculo com
                o ciclo anterior o número é o da INSTITUIÇÃO, e o rótulo diz. */}
            <dt>
              {recebido === null && recebidoInstituicao
                ? `Instituição recebeu em ${anoAnterior}`
                : `Recebeu em ${anoAnterior}`}
            </dt>
            <dd className={recebido === null ? "ausente" : undefined}>
              {recebido !== null
                ? // O salto do pedido é a discussão da renovação; deixar as duas
                  // cifras em linhas separadas obrigava a mesa a fazer a conta.
                  `${fmtMoeda.format(recebido)} (deste mesmo projeto${
                    variacao ? `; ${variacao}` : ""
                  })`
                : recebidoInstituicao
                  ? `${fmtMoeda.format(recebidoInstituicao)} em outros projetos da instituição. ${clausulaTriagem}`
                  : p.ano === 2026
                    ? `Projeto e instituição sem verba em ${anoAnterior}. ${clausulaTriagem}`
                    : "Sem remessa anterior registrada no sistema."}
            </dd>
          </div>
          <div>
            {/* Só a contagem: mediana e "N a favor" já entregam o voto de quem
                avaliou para a sala inteira. Notas e votos ficam recolhidos. */}
            <dt>Avaliações</dt>
            <dd className={p.avaliacoes === 0 ? "ausente" : undefined}>
              {p.avaliacoes === 0
                ? "Chega ao voto sem nenhuma avaliação registrada"
                : `${plural(p.avaliacoes, "avaliação registrada", "avaliações registradas")}: notas e votos recolhidos, mais abaixo`}
            </dd>
          </div>
          {/* Só a ausência ocupa linha: havendo parecer, ele fala por si na
              seção logo abaixo — repeti-lo aqui seria um "ver abaixo". */}
          {!temParecer && (
            <div>
              <dt>Parecer da ASEEC</dt>
              <dd className="ausente">
                Não registrado: sem análise prévia da secretaria
              </dd>
            </div>
          )}
        </dl>
      </section>

      <h2 className="titulo faixa-titulo faixa-analise">Análise do projeto</h2>
      <div className="grade">
        {/* Antes do mérito: numa renovação a pergunta da mesa não é "o que ele
            quer fazer", é "o que ele fez com o dinheiro do ano passado". */}
        {d.anterior && (
          <Secao
            titulo={`Renovação: o que foi a Remessa ${d.anterior.ano}`}
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
                · {rotuloStatus(d.anterior.status)} · solicitou{" "}
                {fmtMoeda.format(d.anterior.solicitado)} · aprovado{" "}
                {d.anterior.aprovado === null
                  ? "sem valor"
                  : fmtMoeda.format(d.anterior.aprovado)}
                {d.anterior.liberado
                  ? ` · liberado ${fmtMoeda.format(d.anterior.liberado)}`
                  : ""}
              </span>
            </p>
            {d.anterior.relatorios.length === 0 && anteriorRecebeu ? (
              // Só 25 dos 223 projetos aprovados em 2025 prestaram contas
              // (pendência 5 do CLAUDE.md). Em cinza de rodapé isso passava
              // batido justamente na tela onde se decide dar mais dinheiro.
              // O link do Drive não apaga a pendência — o sistema continua sem
              // o relatório —, só muda o que a mesa consegue ler agora.
              <p className="aviso">
                {d.anterior.linksPrestacao.length > 0
                  ? `Nada registrado no sistema para a Remessa ${d.anterior.ano}. O que há é o documento abaixo, recebido pela secretaria por fora.`
                  : `Sem prestação de contas da Remessa ${d.anterior.ano}: a renovação chega à mesa sem relatório do que foi feito com ${fmtMoeda.format(d.anterior.liberado ?? d.anterior.aprovado ?? 0)}.`}
              </p>
            ) : (
              <Relatorios relatorios={d.anterior.relatorios} />
            )}
            <LinksDrive links={d.anterior.linksPrestacao} />
            <LinkPrestacao
              alvo={{
                id: d.anterior.id,
                ano: d.anterior.ano,
                titulo: d.anterior.titulo,
              }}
            />
          </Secao>
        )}

        {temParecer && (
          <Secao titulo="Parecer da equipe ASEEC" largura="cheia">
            {/* A mesma duas colunas de "O projeto": o texto corre na medida de
                leitura e as tags ficam ao lado, em vez de um cartão de 1560px
                com metade vazia. */}
            <div className="projeto-corpo">
              <div className="projeto-merito">
                <Campo rotulo="Parecer" valor={d.parecerTexto} />
                <Campo rotulo="Notas do revisor" valor={d.notasDoRevisor} />
              </div>
              {d.parecerTags.length > 0 && (
                <aside className="projeto-ficha">
                  <div className="campo-texto">
                    <h3>Tags</h3>
                    <div className="fichas">
                      {d.parecerTags.map((t) => (
                        <span key={t} className="ficha ficha-clara">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                </aside>
              )}
            </div>
          </Secao>
        )}

        {/*
          Duas colunas porque são duas leituras. À esquerda o mérito, que se lê
          corrido e por isso tem medida limitada; à direita a ficha — natureza,
          parcerias, prazos e os arquivos —, que se consulta. Os anexos moram
          aqui, e não num cartão próprio no topo da grade: ninguém abre um PDF
          na TV, mas quem prepara a pasta procura o orçamento ao lado dos
          prazos. Um cartão a menos, e o mérito passa a abrir a página.
        */}
        <Secao titulo="O projeto" largura="cheia">
          <div className="projeto-corpo">
            <div className="projeto-merito">
              <Campo rotulo="Descrição" valor={d.descricao} />
              <Campo rotulo="Justificativa" valor={d.justificativa} />
              <Campo
                rotulo="Resultados esperados"
                valor={d.resultadosEsperados}
              />
              <Campo rotulo="Metodologia" valor={d.metodologia} />
            </div>
            <aside className="projeto-ficha">
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
              <div className="campo-texto">
                <h3>Prazos</h3>
                <p className="sub">
                  Início {data(d.inicio)} · fim {data(d.fim)}
                  {p.mesesParcelas?.length
                    ? ` · parcelas nos meses ${p.mesesParcelas.join(", ")}`
                    : ""}
                </p>
              </div>
              <div className="campo-texto">
                <h3>Documentos</h3>
                <ListaAnexos anexos={arquivos} />
              </div>
            </aside>
          </div>
        </Secao>

        {/* Depois do mérito, e não antes: o vídeo é o único elemento da pasta
            que não se lê no papel nem se acompanha a três metros sem som. Quem
            precisa dele no meio da reunião chega pelo ▶ Vídeo da barra. */}
        {videos.length > 0 && (
          <Secao
            id="video"
            titulo={
              videos.length > 1
                ? "Vídeos de apresentação"
                : "Vídeo de apresentação"
            }
            largura="cheia"
          >
            <div className="videos">
              {videos.map((v) => (
                // Legenda ao lado da imagem: o vídeo vertical deixava o resto
                // da largura do cartão em branco.
                <figure key={v.id}>
                  {/* preload=metadata: na reunião não dá para baixar 35 MB de
                      cada vídeo da pasta antes de alguém apertar o play.
                      Sem legendas: os arquivos vêm das instituições e a origem
                      não guarda faixa de legenda para nenhum deles. */}
                  <video
                    controls
                    preload="metadata"
                    src={v.url}
                    title={`Vídeo de apresentação: ${p.titulo}`}
                  />
                  <figcaption className="sub">
                    <span>{v.nome}</span>
                    {tamanhoArquivo(v.bytes) && (
                      <span>{tamanhoArquivo(v.bytes)}</span>
                    )}
                    <span className="so-impressao-inline">
                      Vídeo não reproduzível no papel: {v.url}
                    </span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </Secao>
        )}

        {(d.relatorios.length > 0 || d.linksPrestacao.length > 0) && (
          <Secao titulo="Prestação de contas deste projeto" largura="cheia">
            <Relatorios relatorios={d.relatorios} />
            <LinksDrive links={d.linksPrestacao} />
          </Secao>
        )}

        {/* Sem avaliação não há seção: a frase "chega ao voto sem nenhuma
            avaliação" já está na ficha de valores, e em 2026 este bloco era um
            cartão de fileira inteira dizendo isso em todos os 266 projetos. */}
        {d.avaliacoesDetalhe.length > 0 && (
          <Secao
            titulo="Avaliações"
            sub="Recolhidas para preservar o voto de cada diretor: abra só quando a mesa for discutir. As notas são infladas no histórico: leia o comentário."
            largura="cheia"
          >
            {/* key: o <details> aberto num projeto não pode continuar aberto
                no próximo quando se troca pelas setas. */}
            <details key={p.id} className="recolhido">
              <summary>
                Mostrar{" "}
                {plural(d.avaliacoesDetalhe.length, "avaliação", "avaliações")}
              </summary>
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
                          {a.aprovou === null ? NI : a.aprovou ? "Sim" : "Não"}
                        </td>
                        <td>{a.comentario ?? NI}</td>
                        <td>{data(a.enviadaEm)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </Secao>
        )}

        {d.votos.length > 0 && (
          <Secao
            titulo={`Votos por critério: ${plural(d.votos.length, "voto", "votos")}`}
            sub="Recolhidos para preservar o voto de cada diretor."
            largura="cheia"
          >
            <details key={p.id} className="recolhido">
              <summary>Mostrar votos</summary>
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
                              NI
                            ))}
                        </td>
                        <td>{v.tipo}</td>
                        <td>{v.avaliador}</td>
                        <td>{v.valor ?? NI}</td>
                        <td className="n">{v.pontuacao ?? NI}</td>
                        <td>{v.comentario ?? NI}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </Secao>
        )}
      </div>

      {/* A faixa que não decide nada. Estava misturada com o mérito, com o
          mesmo peso de cartão; agora vem depois e anunciada, para a sala saber
          que dali para baixo é conferência de cadastro. */}
      <h2 className="titulo faixa-titulo faixa-registro">
        Registro e cadastro
      </h2>
      {/* Indicadores (1) + Equipe (2), Instituição (2) + Histórico (1): as
          colunas largas vão para o que tem e-mail e telefone, que a um terço
          da largura rolavam de lado. */}
      <div className="grade grade-registro">
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
                    <td>{i.nome ?? NI}</td>
                    <td>{i.meta ?? NI}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Secao>
        )}

        {d.equipe.length > 0 && (
          <Secao titulo="Equipe" largura="dupla">
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
                    <td>{m.nome ?? NI}</td>
                    <td>{m.funcao ?? NI}</td>
                    <td className="contato">{m.contato ?? NI}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Secao>
        )}

        {d.instituicao && (
          <Secao titulo="Instituição" largura="dupla">
            {/* <dl>, não <table>: são pares rótulo–valor, e como tabela isto
                usava <th> dentro do <tbody> sem `scope`. */}
            <dl className="identificacao">
              <div>
                <dt>Nome</dt>
                <dd>{d.instituicao.nome}</dd>
              </div>
              <div>
                <dt>CNPJ</dt>
                <dd>{d.instituicao.cnpj ?? NI}</dd>
              </div>
              <div>
                <dt>Conveniada</dt>
                <dd>{d.instituicao.conveniada ? "Sim" : "Não"}</dd>
              </div>
              <div>
                <dt>Responsável</dt>
                <dd>{d.instituicao.contato ?? NI}</dd>
              </div>
              <div>
                <dt>Contato</dt>
                <dd>
                  {[d.instituicao.email, d.instituicao.telefone]
                    .filter(Boolean)
                    .join(" · ") || NI}
                </dd>
              </div>
              <div>
                <dt>Situação cadastral</dt>
                <dd>{p.enriquecimento.situacaoNoSistema ?? NI}</dd>
              </div>
            </dl>
          </Secao>
        )}

        {/* O registro do registro: as datas de criação e de alteração moram
            aqui, e não na ficha de leitura do mérito. "Alterado", como na
            lista: `updated_at` também se mexe quando o proponente edita. */}
        <Secao titulo="Histórico">
          {d.historico.length > 0 && (
            <ul className="historico">
              {d.historico.map((h, n) => (
                <li key={n}>
                  <span>
                    {h.de ? `${rotuloStatus(h.de)} → ` : ""}
                    <b>{rotuloStatus(h.para)}</b>
                  </span>
                  <span className="sub">
                    {data(h.em)}
                    {h.por ? ` · ${h.por}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="sub historico-registro">
            Registro criado {data(d.criadoEm)} · alterado {data(d.atualizadoEm)}
          </p>
        </Secao>
      </div>
    </div>
  );
}
