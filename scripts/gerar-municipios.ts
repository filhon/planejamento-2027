import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { geoCentroid } from "d3-geo";
import { stringify } from "csv-stringify/sync";
import { REPO_ROOT } from "../src/lib/env";
import { UF_POR_CODIGO } from "../src/lib/parcerias";

/**
 * Gera `data/municipios-br.csv` (código IBGE, nome, UF, lat, lon) a partir da
 * malha oficial do IBGE — roda UMA vez (`npm run municipios:regen`); o painel lê
 * só o CSV. A malha inteira tem 3,6 MB e só serve para o centróide.
 *
 * Nome e UF vêm da API de localidades; a geometria, da malha (`qualidade=minima`
 * já basta para um ponto no mapa do país).
 */

const LOCALIDADES =
  "https://servicodados.ibge.gov.br/api/v1/localidades/municipios?view=nivelado";
const MALHA =
  "https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?intrarregiao=municipio&qualidade=minima&formato=application/vnd.geo+json";

const nomes = (await (await fetch(LOCALIDADES)).json()) as {
  "municipio-id": number;
  "municipio-nome": string;
  "UF-sigla": string;
}[];
const porCodigo = new Map(
  nomes.map((m) => [
    String(m["municipio-id"]),
    { nome: m["municipio-nome"], uf: m["UF-sigla"] },
  ]),
);

const malha = (await (await fetch(MALHA)).json()) as {
  features: { properties: { codarea: string }; geometry: unknown }[];
};

const linhas = malha.features
  .map((f) => {
    const codigo = f.properties.codarea;
    const info = porCodigo.get(codigo);
    let [lon, lat] = geoCentroid(f as never);
    // A malha do IBGE vem com anéis no sentido horário (fora do RFC 7946), e o
    // d3 lê isso como "o resto do planeta": o centróide sai no antípoda. Todo
    // município do Brasil tem lon < 0; se saiu positivo, é o antípoda — desfaz.
    if (lon > 0) {
      lon -= 180;
      lat = -lat;
    }
    return {
      codigo,
      nome: info?.nome ?? "",
      uf: info?.uf ?? UF_POR_CODIGO[codigo.slice(0, 2)] ?? "",
      lat: lat.toFixed(4),
      lon: lon.toFixed(4),
    };
  })
  .sort((a, b) => a.codigo.localeCompare(b.codigo));

writeFileSync(
  resolve(REPO_ROOT, "data", "municipios-br.csv"),
  "﻿" + stringify(linhas, { header: true, record_delimiter: "windows" }),
  "utf-8",
);
console.log(
  `${linhas.length} municípios; sem nome: ${linhas.filter((l) => !l.nome).length}`,
);
