import { dados } from "@/lib/cache";
import Shell from "./shell";

/**
 * A camada de leitura do painel: um único Server Component carrega os projetos
 * de todos os ciclos (só SELECT na origem + junção com data/*.csv) e entrega ao
 * `Shell`. As páginas filhas filtram no navegador — nenhuma ida ao banco por
 * clique de filtro ou troca de página.
 *
 * Os datasets mais pesados (orçamento, avaliações) ficam na página que os usa.
 */

// Dados vivos: nada de pré-render estático. O cache de 15 min é o de src/lib.
export const dynamic = "force-dynamic";

export default async function LayoutPainel({
  children,
}: {
  children: React.ReactNode;
}) {
  let carregados;
  try {
    const ciclos = await dados.ciclos();
    // Do mais recente (2026, em foco) ao mais antigo (2025, comparativo).
    const anos = [...new Set(ciclos.map((c) => c.ano))].sort((a, b) => b - a);
    carregados = await Promise.all(
      anos.map(async (ano) => ({ ano, projetos: await dados.projetos(ano) })),
    );
  } catch (erro) {
    // O `error.tsx` da raiz NÃO cobre o que um layout lança (só o que a página
    // lança) — sem este catch, a base fora do ar viraria a tela branca de erro
    // do Next no meio da reunião. O cache descarta promessas que falharam, então
    // recarregar já é uma nova tentativa.
    return (
      <main>
        <div className="erro cartao">
          <h1 className="titulo">Não foi possível carregar os dados</h1>
          <p>
            A consulta à base (somente leitura) falhou. Confira a conexão e o{" "}
            <code>.env.local</code>, e recarregue a página.
          </p>
          <code>{erro instanceof Error ? erro.message : String(erro)}</code>
        </div>
      </main>
    );
  }

  return <Shell ciclos={carregados}>{children}</Shell>;
}
