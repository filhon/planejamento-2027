import { dobrar } from "./geo";

/**
 * As 27 UFs — tabela pura, sem importar `agregar` (que a usa no filtro de UF)
 * nem `parcerias` (que importa `agregar`): fica aqui para não fechar um ciclo.
 */

export const UF_POR_CODIGO: Record<string, string> = {
  "11": "RO",
  "12": "AC",
  "13": "AM",
  "14": "RR",
  "15": "PA",
  "16": "AP",
  "17": "TO",
  "21": "MA",
  "22": "PI",
  "23": "CE",
  "24": "RN",
  "25": "PB",
  "26": "PE",
  "27": "AL",
  "28": "SE",
  "29": "BA",
  "31": "MG",
  "32": "ES",
  "33": "RJ",
  "35": "SP",
  "41": "PR",
  "42": "SC",
  "43": "RS",
  "50": "MS",
  "51": "MT",
  "52": "GO",
  "53": "DF",
};

export const NOME_UF: Record<string, string> = {
  AC: "Acre",
  AL: "Alagoas",
  AM: "Amazonas",
  AP: "Amapá",
  BA: "Bahia",
  CE: "Ceará",
  DF: "Distrito Federal",
  ES: "Espírito Santo",
  GO: "Goiás",
  MA: "Maranhão",
  MG: "Minas Gerais",
  MS: "Mato Grosso do Sul",
  MT: "Mato Grosso",
  PA: "Pará",
  PB: "Paraíba",
  PE: "Pernambuco",
  PI: "Piauí",
  PR: "Paraná",
  RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte",
  RO: "Rondônia",
  RR: "Roraima",
  RS: "Rio Grande do Sul",
  SC: "Santa Catarina",
  SE: "Sergipe",
  SP: "São Paulo",
  TO: "Tocantins",
};

export const UFS = Object.keys(NOME_UF).sort();

const UF_POR_NOME = new Map(
  Object.entries(NOME_UF).map(([uf, nome]) => [dobrar(nome), uf]),
);
// Grafias do ranking de demanda que fogem do nome oficial.
UF_POR_NOME.set("rio grande norte", "RN");

/** "Goias", "Rio Grande Norte", "PE" → "PE". */
export function ufDe(texto: string | null | undefined): string | null {
  const t = (texto ?? "").trim();
  if (!t || t === "-") return null;
  if (t.length === 2 && NOME_UF[t.toUpperCase()]) return t.toUpperCase();
  return UF_POR_NOME.get(dobrar(t)) ?? null;
}
