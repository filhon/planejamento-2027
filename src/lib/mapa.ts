import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { geoNaturalEarth1, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import isoCountries from "i18n-iso-countries";
import { REPO_ROOT } from "./env";

/**
 * Geometria do mapa-múndi, resolvida NO SERVIDOR.
 *
 * O cliente recebe só `{ iso3, nome, d }` — path SVG já projetado. Assim d3-geo,
 * topojson e o de-para de códigos ficam fora do bundle do navegador, e a página
 * do mapa é SVG puro.
 *
 * Fonte: Natural Earth 110m via npm `world-atlas` (domínio público), vendorizado
 * em `data/countries-110m.json` para não depender de node_modules em runtime.
 * Os ids do arquivo são códigos ISO 3166-1 *numéricos* — daí o de-para para ISO-3,
 * que é a chave usada em `data/country_map.csv`.
 */

export const LARGURA_MAPA = 980;
export const ALTURA_MAPA = 500;
/** Passado como prop para o cliente não repetir estas medidas. */
export const VIEW_BOX = `0 0 ${LARGURA_MAPA} ${ALTURA_MAPA}`;

export interface PaisGeo {
  /** null quando o Natural Earth não traz código (Kosovo, Somalilândia, N. Chipre). */
  iso3: string | null;
  nome: string;
  /** atributo `d` de um <path> SVG, no viewBox LARGURA_MAPA × ALTURA_MAPA. */
  d: string;
}

let cache: PaisGeo[] | null = null;

export function geometriaMundo(): PaisGeo[] {
  if (cache) return cache;

  const topo = JSON.parse(
    readFileSync(resolve(REPO_ROOT, "data", "countries-110m.json"), "utf-8"),
  );
  const colecao = feature(topo, topo.objects.countries) as unknown as {
    features: {
      id?: string | number;
      properties: { name: string };
    }[];
  };

  const projecao = geoNaturalEarth1().fitSize(
    [LARGURA_MAPA, ALTURA_MAPA],
    colecao as never,
  );
  // 1 casa decimal já é sub-pixel nesta escala e corta ~40% do payload.
  const path = geoPath(projecao).digits(1);

  cache = colecao.features
    .map((f) => {
      const d = path(f as never);
      if (!d) return null;
      const numerico = String(f.id ?? "").padStart(3, "0");
      return {
        iso3: isoCountries.numericToAlpha3(numerico) ?? null,
        nome: f.properties.name,
        d,
      };
    })
    .filter((p): p is PaisGeo => p !== null);

  return cache;
}
