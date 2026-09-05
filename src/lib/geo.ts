import {
  CONTINENTE_SENSIVEL,
  GRUPO_SENSIVEL,
  type CountryMapRow,
  type LocalNormalizado,
} from "./types";

/**
 * Normalização de local (docs/normalizacao-paises.md).
 *
 * A dimensão é o PAÍS; cidade/estado só servem de resgate para os projetos de
 * área sensível gravados como `country = 'Outro'`. O de-para vem de
 * data/country_map.csv — nada disso toca a origem.
 */

/** Remove acentos e caixa, para casar "Moçambique" com "mocambique". */
export function dobrar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/** Valores de `country` que significam "sem país declarado". */
const SEM_PAIS = new Set(["outro", "outros", "", "n/a", "na", "-"]);

/**
 * Regiões multi-país. Quando aparecem no texto de state/city de um projeto
 * sensível, o projeto fica no grupo "Multi-país / sensível" mesmo que algum
 * nome de país também apareça (ex.: "Oriente Médio e Índia").
 */
const REGIOES_MULTIPAIS = [
  "africa subsaariana",
  "norte da africa",
  "africa do norte",
  "oriente medio",
  "sudeste asiatico",
  "asia central",
  "chifre da africa",
  "amazonia",
  "sahel",
  "magreb",
  "balcas",
  "america latina",
  "asia",
];

export interface CountryIndex {
  /** raw_country (dobrado) → linha do de-para. */
  porChave: Map<string, CountryMapRow>;
  /** termos buscáveis dentro de texto livre, do mais longo para o mais curto. */
  termos: { termo: string; row: CountryMapRow }[];
}

export function construirIndicePaises(rows: CountryMapRow[]): CountryIndex {
  const porChave = new Map<string, CountryMapRow>();
  const termosSet = new Map<string, CountryMapRow>();

  for (const row of rows) {
    const chave = dobrar(row.rawCountry);
    porChave.set(chave, row);
    termosSet.set(chave, row);
    termosSet.set(dobrar(row.namePt), row);
  }

  const termos = [...termosSet.entries()]
    .map(([termo, row]) => ({ termo, row }))
    .sort((a, b) => b.termo.length - a.termo.length);

  return { porChave, termos };
}

const LOCAL_SENSIVEL: Omit<LocalNormalizado, "fonte" | "bruto"> = {
  iso3: null,
  nomePt: GRUPO_SENSIVEL,
  continente: CONTINENTE_SENSIVEL,
  sensivel: true,
};

function escaparRegex(t: string): string {
  return t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Casa nomes de país inteiros dentro de texto livre (evita "Níger" ⊂ "Nigéria"). */
function paisesNoTexto(texto: string, indice: CountryIndex): CountryMapRow[] {
  const alvo = dobrar(texto);
  const achados = new Map<string, CountryMapRow>();
  for (const { termo, row } of indice.termos) {
    const re = new RegExp(
      `(^|[^\\p{L}\\p{N}])${escaparRegex(termo)}($|[^\\p{L}\\p{N}])`,
      "u",
    );
    if (re.test(alvo)) achados.set(row.iso3, row);
  }
  return [...achados.values()];
}

function temRegiaoMultipais(texto: string): boolean {
  const alvo = dobrar(texto);
  return REGIOES_MULTIPAIS.some((regiao) => {
    const re = new RegExp(
      `(^|[^\\p{L}\\p{N}])${escaparRegex(regiao)}($|[^\\p{L}\\p{N}])`,
      "u",
    );
    return re.test(alvo);
  });
}

export interface EntradaLocal {
  country: string | null;
  state?: string | null;
  city?: string | null;
}

/**
 * Resolve o país de um projeto:
 *  1. `country` casa direto com o de-para → país;
 *  2. `country = 'Outro'` (área sensível) → tenta o país real em `state`/`city`,
 *     desde que o texto não cite uma região multi-país e aponte para um único país;
 *  3. caso contrário → grupo "Multi-país / sensível" (conta em KPI, não pinta o mapa).
 */
export function normalizarLocal(
  entrada: EntradaLocal,
  indice: CountryIndex,
): LocalNormalizado {
  const bruto = entrada.country?.trim() ?? null;
  const chave = dobrar(bruto ?? "");

  if (chave && !SEM_PAIS.has(chave)) {
    const direto = indice.porChave.get(chave);
    if (direto) {
      return {
        iso3: direto.iso3,
        nomePt: direto.namePt,
        continente: direto.continent,
        sensivel: false,
        fonte: "country",
        bruto,
      };
    }
    // País fora do de-para: não inventar ISO — sinalizar para a equipe completar o CSV.
    return {
      iso3: null,
      nomePt: bruto ?? "",
      continente: "Não mapeado",
      sensivel: false,
      fonte: "country",
      bruto,
    };
  }

  for (const fonte of ["state", "city"] as const) {
    const texto = entrada[fonte];
    if (!texto || !texto.trim()) continue;
    if (temRegiaoMultipais(texto)) break; // texto multi-região encerra o resgate
    const achados = paisesNoTexto(texto, indice);
    if (achados.length === 1) {
      const row = achados[0]!;
      // País resgatado: pinta o mapa normalmente. O caráter sensível do projeto
      // continua sinalizado por `cycle_projects.area_sensivel` e por `fonte`.
      return {
        iso3: row.iso3,
        nomePt: row.namePt,
        continente: row.continent,
        sensivel: false,
        fonte,
        bruto,
      };
    }
    if (achados.length > 1) break; // ambíguo → multi-país
  }

  return { ...LOCAL_SENSIVEL, fonte: "sem-pais", bruto };
}
