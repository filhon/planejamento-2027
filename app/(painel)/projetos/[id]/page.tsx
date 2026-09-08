import { notFound } from "next/navigation";
import { dados } from "@/lib/cache";
import Detalhe from "./detalhe";

/**
 * Página 08 — a pasta de um projeto (Fase 5, docs/fase5-projetos.md).
 *
 * Server Component: o `projetoDetalhe` puxa tudo o que a origem guarda sobre o
 * projeto (só SELECT) e já devolve as URLs públicas do Storage — o vídeo toca
 * direto do bucket, sem proxy e sem SDK.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detalhe = await dados.detalhe(id);
  if (!detalhe) notFound();

  return <Detalhe d={detalhe} />;
}
