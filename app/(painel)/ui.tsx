"use client";

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
  /** Linha de apoio quando não há delta a mostrar. */
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
}

/** Ranking em barras — categorias, continentes, funil, conselheiros. */
export function Barras({
  itens,
  vazio = "Nada com os filtros atuais.",
}: {
  itens: ItemBarra[];
  vazio?: string;
}) {
  if (itens.length === 0) return <p className="sub">{vazio}</p>;
  const maximo = Math.max(1, ...itens.map((i) => i.valor));

  return (
    <ul className="barras">
      {itens.map((i) => {
        const conteudo = (
          <>
            <span className="linha-topo">
              <b>{i.rotulo}</b>
              <span>{i.texto}</span>
            </span>
            <span className="barra">
              <i
                style={{
                  width: `${Math.max(2, (i.valor / maximo) * 100)}%`,
                  background: i.cor ?? "var(--azul)",
                }}
              />
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
  children,
  largura,
}: {
  titulo: string;
  sub?: string;
  children: React.ReactNode;
  /** "dupla" = 2 colunas da grade, "cheia" = a fileira inteira. */
  largura?: "cheia" | "dupla";
}) {
  return (
    <section className={`bloco cartao${largura ? ` ${largura}` : ""}`}>
      <h2 className="titulo">{titulo}</h2>
      {sub && <p className="sub">{sub}</p>}
      <div className="rolagem-x">{children}</div>
    </section>
  );
}
