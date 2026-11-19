"use client";

import { SEM_RESULTADO } from "./formato";

/** Peças visuais reusadas pelas páginas (KPI com delta e barras ordenadas). */

export function Kpi({
  rotulo,
  valor,
  atual,
  anterior,
  anoAnterior,
  formatar,
  nota,
  tom,
  inverso,
}: {
  rotulo: string;
  valor: string;
  atual?: number;
  anterior?: number | null;
  anoAnterior?: number | undefined;
  formatar?: (v: number) => string;
  /** Linha de apoio. Com delta, desce para baixo dele em vez de sumir. */
  nota?: string;
  tom?: "bom" | "atencao" | "ruim";
  /** true quando subir é ruim (ex.: pressão da demanda). */
  inverso?: boolean;
}) {
  const delta =
    atual === undefined || anterior === null || anterior === undefined
      ? null
      : atual - anterior;
  const bom = delta === null ? false : inverso ? delta < 0 : delta > 0;

  return (
    <div className={`kpi cartao${tom ? ` kpi-${tom}` : ""}`}>
      <div className="kpi-rotulo">{rotulo}</div>
      <div className="kpi-valor">{valor}</div>
      <div className="kpi-delta">
        {delta === null || !formatar ? (
          (nota ?? (atual === undefined ? "" : "sem ciclo anterior"))
        ) : (
          <>
            <span
              className={delta === 0 ? undefined : bom ? "subiu" : "desceu"}
            >
              {delta > 0 ? "▲ +" : delta < 0 ? "▼ −" : "= "}
              {formatar(Math.abs(delta))}
            </span>{" "}
            vs {anoAnterior}
            {/* A nota não some quando há delta: são as duas leituras do mesmo
                número (o quanto mudou e do que ele é feito), e era ela que
                justificava a tabela comparadora repetida embaixo dos KPIs. */}
            {nota && <span className="kpi-nota">{nota}</span>}
          </>
        )}
      </div>
    </div>
  );
}

export interface ItemBarra {
  chave: string;
  rotulo: string;
  valor: number;
  texto: string;
  cor?: string;
  ativo?: boolean;
  aoClicar?: () => void;
  /**
   * Segunda medida na MESMA escala, desenhada cheia por dentro da barra (forma
   * de "bullet"): pedido é a pista clara, referência é o trecho sólido. Serve a
   * "esta categoria pede X; aprovado foi Y" sem inventar um segundo eixo.
   */
  referencia?: number;
}

/** Ranking em barras — categorias, continentes, funil, conselheiros. */
export function Barras({
  itens,
  vazio = SEM_RESULTADO,
}: {
  itens: ItemBarra[];
  vazio?: string;
}) {
  if (itens.length === 0) return <p className="sub">{vazio}</p>;
  const maximo = Math.max(
    1,
    ...itens.map((i) => Math.max(i.valor, i.referencia ?? 0)),
  );

  return (
    <ul className="barras">
      {itens.map((i) => {
        const conteudo = (
          <>
            <span className="linha-topo">
              <b>{i.rotulo}</b>
              <span>{i.texto}</span>
            </span>
            <span
              className={`barra${i.referencia === undefined ? "" : " barra-bullet"}`}
            >
              <i
                style={{
                  width: `${Math.max(2, (i.valor / maximo) * 100)}%`,
                  background: i.cor ?? "var(--azul)",
                }}
              />
              {i.referencia !== undefined && (
                <i
                  className="referencia"
                  style={{ width: `${(i.referencia / maximo) * 100}%` }}
                />
              )}
            </span>
          </>
        );
        return (
          <li key={i.chave}>
            {i.aoClicar ? (
              <button
                className="linha-pais"
                aria-pressed={i.ativo ?? false}
                onClick={i.aoClicar}
              >
                {conteudo}
              </button>
            ) : (
              <div className="linha-pais">{conteudo}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function Secao({
  titulo,
  sub,
  acoes,
  children,
  largura,
  id,
}: {
  titulo: string;
  sub?: string;
  /** Botões no canto superior direito (ex.: exportar). Somem na impressão. */
  acoes?: React.ReactNode;
  children: React.ReactNode;
  /** "dupla" = 2 colunas da grade, "cheia" = a fileira inteira. */
  largura?: "cheia" | "dupla";
  /** Alvo de âncora (ex.: o ▶ Vídeo da barra da pasta). */
  id?: string;
}) {
  return (
    <section id={id} className={`bloco cartao${largura ? ` ${largura}` : ""}`}>
      <div className="bloco-topo">
        <div>
          <h2 className="titulo">{titulo}</h2>
          {sub && <p className="sub">{sub}</p>}
        </div>
        {acoes && <div className="bloco-acoes">{acoes}</div>}
      </div>
      <div className="rolagem-x">{children}</div>
    </section>
  );
}

/**
 * Régua de desvio: barra divergente com o zero no meio. À direita (laranja) a
 * rubrica pede ACIMA do envelope da diretriz, à esquerda (azul) fica abaixo.
 *
 * O mesmo dado está codificado três vezes (lado, cor e a palavra na célula ao
 * lado) porque esta página sai em fotocópia preto e branco e é lida a três
 * metros na TV. A escala é comum a todas as linhas (o maior desvio ocupa a
 * meia-largura), com piso de 5 p.p. para desvio pequeno não parecer grande.
 */
export function Regua({ pp, escala }: { pp: number; escala: number }) {
  const largura = Math.min(50, (Math.abs(pp) / escala) * 50);
  if (largura < 0.5) return <span className="regua" aria-hidden="true" />;
  return (
    <span className="regua" aria-hidden="true">
      <i
        className={pp > 0 ? "acima" : "abaixo"}
        style={{ width: `${largura}%` }}
      />
    </span>
  );
}
