import { notFound } from "next/navigation";
import { dados } from "@/lib/cache";
import { lerDecisao, linksPrestacao } from "@/lib/painel-db";
import Detalhe from "./detalhe";

/**
 * Página 08 — a pasta de um projeto (Fase 5, docs/fase5-projetos.md).
 *
 * Server Component: o `projetoDetalhe` puxa tudo o que a origem guarda sobre o
 * projeto (só SELECT) e já devolve as URLs públicas do Storage — o vídeo toca
 * direto do bucket, sem proxy e sem SDK.
 *
 * O que o painel grava (links do Drive, decisão de contingência) vem do
 * Firestore a cada requisição, sem o cache de 15 min da origem: na Vercel cada
 * instância tem o seu cache, e o que um diretor salva tem que aparecer para
 * todos na hora.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detalhe = await dados.detalhe(id);
  if (!detalhe) notFound();

  const anterior = detalhe.anterior;
  const p = detalhe.projeto;
  const [links, decisao, avaliadores, remessaAnterior] = await Promise.all([
    linksPrestacao(anterior ? [id, anterior.id] : [id]),
    lerDecisao(id),
    dados.avaliadores(),
    dados.projetos(p.ano - 1),
  ]);

  // Opções de vínculo da triagem: os projetos da mesma instituição na remessa
  // anterior, mais o vínculo já gravado (que pode ser de outra instituição) —
  // fora da lista, o select o apagaria ao salvar outro campo.
  const curado = p.revisao.projetoAnteriorIdCurado;
  const anteriores = remessaAnterior
    .filter(
      (a) =>
        (p.instituicaoId && a.instituicaoId === p.instituicaoId) ||
        a.id === curado,
    )
    .map((a) => ({ id: a.id, titulo: a.titulo }));

  return (
    <Detalhe
      d={{
        ...detalhe,
        linksPrestacao: links.get(id) ?? [],
        anterior: anterior && {
          ...anterior,
          linksPrestacao: links.get(anterior.id) ?? [],
        },
      }}
      decisao={decisao}
      triagem={{
        avaliadores: avaliadores.filter((a) => a.ativo).map((a) => a.nome),
        anteriores,
      }}
    />
  );
}
