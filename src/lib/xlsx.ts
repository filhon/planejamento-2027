/**
 * Escritor mínimo de .xlsx — só o que a exportação da reunião precisa: uma aba,
 * células de texto e número, larguras de coluna e o cabeçalho congelado.
 *
 * Um .xlsx é um zip de XMLs. As entradas vão **armazenadas** (método 0, sem
 * compressão): o Excel aceita, e evita tanto uma biblioteca de zip quanto o
 * `CompressionStream` (que é assíncrono) por causa de umas centenas de linhas.
 * Sem `styles.xml` — os números saem crus, que é o que se soma na planilha.
 *
 * Puro: roda no cliente (a exportação) e no Node (o teste). Nada de `fs`/`pg`.
 */

/** `{ texto, link }` = hiperlink externo de verdade (clicável no Excel/Sheets). */
export type Celula = string | number | null | { texto: string; link: string };

// ------------------------------------------------------------------- zip

const TABELA_CRC = /* @__PURE__ */ (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = TABELA_CRC[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function juntar(partes: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const total = partes.reduce((s, p) => s + p.length, 0);
  const saida = new Uint8Array(total);
  let i = 0;
  for (const p of partes) {
    saida.set(p, i);
    i += p.length;
  }
  return saida;
}

/** Zip só com o essencial: sem compressão, sem data (1980-01-01), sem zip64. */
function zip(
  entradas: { nome: string; dados: Uint8Array }[],
): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder();
  const locais: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let deslocamento = 0;

  for (const e of entradas) {
    const nome = enc.encode(e.nome);
    const crc = crc32(e.dados);
    const tam = e.dados.length;

    const local = new Uint8Array(30 + nome.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); // PK\3\4
    lv.setUint16(4, 20, true); // versão necessária
    lv.setUint16(6, 0x0800, true); // nomes em UTF-8
    lv.setUint16(8, 0, true); // método 0 = armazenado
    lv.setUint32(14, crc, true);
    lv.setUint32(18, tam, true);
    lv.setUint32(22, tam, true);
    lv.setUint16(26, nome.length, true);
    local.set(nome, 30);
    locais.push(local, e.dados);

    const c = new Uint8Array(46 + nome.length);
    const cv = new DataView(c.buffer);
    cv.setUint32(0, 0x02014b50, true); // PK\1\2
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, tam, true);
    cv.setUint32(24, tam, true);
    cv.setUint16(28, nome.length, true);
    cv.setUint32(42, deslocamento, true);
    c.set(nome, 46);
    central.push(c);

    deslocamento += local.length + tam;
  }

  const diretorio = juntar(central);
  const fim = new Uint8Array(22);
  const fv = new DataView(fim.buffer);
  fv.setUint32(0, 0x06054b50, true); // PK\5\6
  fv.setUint16(8, entradas.length, true);
  fv.setUint16(10, entradas.length, true);
  fv.setUint32(12, diretorio.length, true);
  fv.setUint32(16, deslocamento, true);

  return juntar([...locais, diretorio, fim]);
}

// ------------------------------------------------------------------- xml

/**
 * XML 1.0 não aceita caracteres de controle, e a origem tem muito texto colado
 * de PDF/Word — um único deles derruba a planilha inteira no Excel. Viram espaço
 * (inclusive a quebra de linha: sem `wrapText` ela não apareceria mesmo).
 */
const esc = (s: string) =>
  [...s]
    .map((c) => (c < " " ? " " : c))
    .join("")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/** 0 → A, 25 → Z, 26 → AA. */
function coluna(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26))
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const NS_REL =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_PKG_REL =
  "http://schemas.openxmlformats.org/package/2006/relationships";
const NS_SS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const TIPO_OOXML =
  "application/vnd.openxmlformats-officedocument.spreadsheetml";

/**
 * Uma aba, as linhas na ordem em que vêm. `larguras` é em caracteres (o Excel
 * mede assim); `congelar` é quantas linhas do topo ficam presas ao rolar.
 */
export function planilha(
  aba: string,
  linhas: Celula[][],
  {
    larguras = [],
    congelar = 0,
  }: { larguras?: number[]; congelar?: number } = {},
): Uint8Array<ArrayBuffer> {
  const links: { ref: string; url: string }[] = [];
  const corpo = linhas
    .map((linha, l) => {
      const celulas = linha
        .map((v, c) => {
          if (v === null || v === "") return "";
          const ref = `${coluna(c)}${l + 1}`;
          if (typeof v === "object") links.push({ ref, url: v.link });
          const texto = typeof v === "object" ? v.texto : v;
          return typeof texto === "number"
            ? `<c r="${ref}"><v>${Number.isFinite(texto) ? texto : 0}</v></c>`
            : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(texto)}</t></is></c>`;
        })
        .join("");
      return `<row r="${l + 1}">${celulas}</row>`;
    })
    .join("");

  const cols = larguras.length
    ? `<cols>${larguras
        .map(
          (w, i) =>
            `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`,
        )
        .join("")}</cols>`
    : "";

  const painel = congelar
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${congelar}" topLeftCell="A${congelar + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    : "";

  const enc = new TextEncoder();
  const parte = (nome: string, xml: string) => ({
    nome,
    dados: enc.encode(XML + xml),
  });

  return zip([
    parte(
      "[Content_Types].xml",
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="${TIPO_OOXML}.sheet.main+xml"/>` +
        `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="${TIPO_OOXML}.worksheet+xml"/>` +
        `</Types>`,
    ),
    parte(
      "_rels/.rels",
      `<Relationships xmlns="${NS_PKG_REL}"><Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    parte(
      "xl/workbook.xml",
      `<workbook xmlns="${NS_SS}" xmlns:r="${NS_REL}"><sheets>` +
        // O Excel recusa [ ] : * ? / \\ e nomes com mais de 31 caracteres.
        `<sheet name="${esc(aba.replace(/[\\/*?:[\]]/g, " ").slice(0, 31))}" sheetId="1" r:id="rId1"/>` +
        `</sheets></workbook>`,
    ),
    parte(
      "xl/_rels/workbook.xml.rels",
      `<Relationships xmlns="${NS_PKG_REL}"><Relationship Id="rId1" Type="${NS_REL}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    ),
    parte(
      "xl/worksheets/sheet1.xml",
      `<worksheet xmlns="${NS_SS}" xmlns:r="${NS_REL}">${painel}${cols}<sheetData>${corpo}</sheetData>` +
        (links.length
          ? `<hyperlinks>${links
              .map((h, i) => `<hyperlink ref="${h.ref}" r:id="rIdL${i + 1}"/>`)
              .join("")}</hyperlinks>`
          : "") +
        `</worksheet>`,
    ),
    // Hiperlink externo mora numa relação da aba, não na célula.
    ...(links.length
      ? [
          parte(
            "xl/worksheets/_rels/sheet1.xml.rels",
            `<Relationships xmlns="${NS_PKG_REL}">${links
              .map(
                (h, i) =>
                  `<Relationship Id="rIdL${i + 1}" Type="${NS_REL}/hyperlink" Target="${esc(h.url).replace(/"/g, "&quot;")}" TargetMode="External"/>`,
              )
              .join("")}</Relationships>`,
          ),
        ]
      : []),
  ]);
}

export const TIPO_XLSX = `${TIPO_OOXML}.sheet`;
