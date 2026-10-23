"use client";

import { createContext, useContext } from "react";
import type { ProjetoCiclo } from "@/lib/types";
import type { Filtros } from "@/lib/agregar";

/**
 * Estado global da reunião: ano ativo + filtros cruzados.
 *
 * Vive no layout (`shell.tsx`), então sobrevive à navegação entre as páginas —
 * clicar num país no Mapa e ir para o Orçamento mantém o recorte. Os projetos
 * de todos os ciclos já vêm do servidor; filtrar é só `Array.filter`.
 *
 * As regras do recorte (`filtrar`, `alternar`, `SEM_FILTRO`) moram em
 * `src/lib/agregar.ts`, junto das outras regras puras — e são testadas lá.
 */

export {
  SEM_FILTRO,
  SEM_RESPONSAVEL,
  alternar,
  casaBusca,
  ehConveniada,
  filtrar,
  temFiltro,
  type Filtros,
} from "@/lib/agregar";

export interface CicloCarregado {
  ano: number;
  projetos: ProjetoCiclo[];
}

export interface EstadoPainel {
  /** Ciclos do mais recente ao mais antigo, com todos os projetos. */
  ciclos: CicloCarregado[];
  ano: number;
  trocarAno: (ano: number) => void;
  /** Ciclo anterior ao ativo — a base de todo delta. */
  anoAnterior: number | undefined;
  filtros: Filtros;
  aplicar: (parcial: Partial<Filtros>) => void;
  alternarPais: (iso3: string | null) => void;
  /** Nome em português do país filtrado — null sem filtro de país. */
  nomePais: string | null;
  limpar: () => void;
  filtroAtivo: boolean;
  /** Projetos do ano ativo, já filtrados. */
  projetos: ProjetoCiclo[];
  /** Projetos do ano anterior, com os mesmos filtros (comparativo). */
  projetosAnteriores: ProjetoCiclo[];
  /** Todos os projetos do ano ativo, sem filtro — para montar as opções. */
  todos: ProjetoCiclo[];
  opcoes: {
    continentes: string[];
    /** Status da origem (os 14 do enum, na ordem do fluxo). */
    status: string[];
    categorias: string[];
    /** Nomes das instituições com projeto no ciclo ativo. */
    instituicoes: string[];
    /** Diretores/conselheiros que já têm pasta no ciclo ativo (Fase 5). */
    responsaveis: string[];
    /** Tags do parecer da ASEEC em uso no ciclo ativo (Fase 10). */
    tags: string[];
  };
}

const Contexto = createContext<EstadoPainel | null>(null);
export const ProvedorPainel = Contexto.Provider;

export function usePainel(): EstadoPainel {
  const estado = useContext(Contexto);
  if (!estado) throw new Error("usePainel() fora do layout do painel");
  return estado;
}
