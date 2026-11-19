"use client";

import Link from "next/link";
import { usePainel } from "../../contexto";
import { fmtMoeda } from "../../formato";
import IrPara, { urlVotacao } from "../ir-para";

/**
 * A barra da pasta — grudada no topo enquanto a sala rola o projeto.
 *
 * Existe porque a reunião é dinâmica: a pergunta que volta a cada minuto é
 * "quanto ele está pedindo mesmo?", e o número ficava três telas acima do
 * parágrafo que está sendo lido em voz alta. Aqui moram as únicas coisas que
 * não podem sair da tela — onde estamos no recorte, o nome e o pedido.
 *
 * ‹ › andam pelos projetos do RECORTE ativo: exatamente o que as setas do
 * modo apresentação já faziam (ver `ir()` em shell.tsx), agora visíveis e
 * disponíveis fora dele — até hoje só passava para o próximo da pasta quem
 * sabia do atalho de teclado. Fora do recorte (ano trocado, ou filtro que
 * exclui este projeto) não há passo, e a barra fica só com o nome e o valor.
 */
export default function Barra({
  id,
  numero,
  titulo,
  solicitado,
  temVideo,
}: {
  id: string;
  numero: number;
  titulo: string;
  solicitado: number;
  temVideo: boolean;
}) {
  const { projetos } = usePainel();
  const i = projetos.findIndex((p) => p.id === id);
  const passo = (n: number) =>
    projetos[(i + n + projetos.length) % projetos.length]!;

  return (
    <div className="pasta-barra">
      <Link className="voltar" href="/projetos">
        ← Projetos &amp; Pastas
      </Link>

      {i >= 0 && projetos.length > 1 && (
        <span className="pasta-passo">
          <Link
            href={`/projetos/${passo(-1).id}`}
            aria-label="Projeto anterior do recorte"
          >
            ‹
          </Link>
          <span>
            {i + 1} de {projetos.length}
          </span>
          <Link
            href={`/projetos/${passo(1).id}`}
            aria-label="Próximo projeto do recorte"
          >
            ›
          </Link>
        </span>
      )}

      <IrPara />

      <span className="pasta-numero">Nº {numero}</span>
      <b className="pasta-titulo">{titulo}</b>

      {/* A busca do sistema de votação só acha por nome; o link vai direto. */}
      <a
        className="pasta-ancora"
        href={urlVotacao(id)}
        target="_blank"
        rel="noopener noreferrer"
      >
        Abrir na votação ↗
      </a>

      {/* O "roda o vídeo" da reunião: o vídeo fica depois do mérito no DOM (é
          lá que ele pertence no papel), então o salto precisa de uma âncora. */}
      {temVideo && (
        <a className="pasta-ancora" href="#video">
          ▶ Vídeo
        </a>
      )}

      <span className="pasta-pedido">
        <span>Solicitado</span> {fmtMoeda.format(solicitado)}
      </span>
    </div>
  );
}
