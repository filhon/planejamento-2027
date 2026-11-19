/**
 * Escritor de .xlsx sem biblioteca. Dois usos:
 *  - `planilha()`: uma aba crua (a exportação de Projetos & Pastas);
 *  - `pasta()`: várias abas com estilo, fórmula, validação de dados,
 *    formatação condicional, mesclagem e impressão (a planilha de Envelopes).
 *
 * Um .xlsx é um zip de XMLs. As entradas vão **armazenadas** (método 0, sem
 * compressão): o Excel aceita, e evita tanto uma biblioteca de zip quanto o
 * `CompressionStream` (que é assíncrono) por causa de umas centenas de linhas.
 * Os estilos são uma paleta FIXA (`Estilo`), não um motor de estilos: cada
 * nome vira um índice de `cellXfs`. Fórmula leva o valor já calculado (`v`)
 * para quem só pré-visualiza, e `fullCalcOnLoad` faz o Excel recalcular ao abrir.
 *
 * Puro: roda no cliente (a exportação) e no Node (o teste). Nada de `fs`/`pg`.
 */

/**
 * Célula rica: `f` = fórmula (sintaxe em inglês, sem "="; `v` é o resultado
 * já calculado), `s` = estilo da paleta, `link` = hiperlink externo.
 */
export interface Rica {
  v?: string | number | null;
  f?: string;
  s?: Estilo;
  link?: string;
}

/** `{ texto, link }` = hiperlink externo de verdade (clicável no Excel/Sheets). */
export type Celula =
  string | number | null | { texto: string; link: string } | Rica;

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

const attr = (s: string) => esc(s).replace(/"/g, "&quot;");

/** 0 → A, 25 → Z, 26 → AA. */
export function coluna(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26))
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Nome de aba em referência de fórmula: sempre entre aspas simples. */
export const refAba = (nome: string) => `'${nome.replace(/'/g, "''")}'`;

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const NS_REL =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_PKG_REL =
  "http://schemas.openxmlformats.org/package/2006/relationships";
const NS_SS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const TIPO_OOXML =
  "application/vnd.openxmlformats-officedocument.spreadsheetml";

// --------------------------------------------------------------- estilos

/**
 * Arial em tudo: existe no Windows, no Mac e no Google Sheets (o LibreOffice
 * tem a Liberation Sans de mesma métrica). Titillium/Parkinsans faltariam na
 * máquina de quem recebe, e o Excel trocaria a fonte sem avisar, desalinhando
 * as colunas. A marca entra pelas cores.
 */
const FONTE = "Arial";
const AZUL = "FF202C85";
const CORPO = "FF16203F";
const CINZA = "FF5B6280";
const CINZA_CLARO = "FF8A90A8";

const fonte = (
  sz: number,
  cor: string,
  extra: { b?: true; i?: true; u?: true } = {},
) =>
  `<font>${extra.b ? "<b/>" : ""}${extra.i ? "<i/>" : ""}${extra.u ? "<u/>" : ""}<sz val="${sz}"/><color rgb="${cor}"/><name val="${FONTE}"/><family val="2"/></font>`;

const FONTES = [
  fonte(10, CORPO), // 0 corpo
  fonte(16, AZUL, { b: true }), // 1 título
  fonte(9, CINZA, { i: true }), // 2 subtítulo / nota
  fonte(10, "FFFFFFFF", { b: true }), // 3 cabeçalho (sobre azul)
  fonte(10, AZUL, { b: true }), // 4 faixa / total
  fonte(10, CORPO, { b: true }), // 5 rótulo
  fonte(10, AZUL, { u: true }), // 6 link
  fonte(10, CINZA_CLARO), // 7 cinza (fora da proposta, referência)
  fonte(10, AZUL), // 8 entrada (azul = digitável, convenção de planilha financeira)
  fonte(14, AZUL, { b: true }), // 9 número em destaque
];

const solido = (cor: string) =>
  `<fill><patternFill patternType="solid"><fgColor rgb="${cor}"/><bgColor indexed="64"/></patternFill></fill>`;

const PREENCHIMENTOS = [
  `<fill><patternFill patternType="none"/></fill>`, // 0 (reservado pelo Excel)
  `<fill><patternFill patternType="gray125"/></fill>`, // 1 (reservado pelo Excel)
  solido(AZUL), // 2 cabeçalho
  solido("FFE9EBF6"), // 3 faixa e total (azul bem claro)
  solido("FFE3F6FD"), // 4 ENTRADA (azul-claro da marca, bem claro)
];

const lado = (nome: string, estilo?: string, cor?: string) =>
  estilo
    ? `<${nome} style="${estilo}"><color rgb="${cor}"/></${nome}>`
    : `<${nome}/>`;

const BORDAS = [
  `<border><left/><right/><top/><bottom/><diagonal/></border>`, // 0
  `<border><left/><right/><top/>${lado("bottom", "thin", "FFDDE0EA")}<diagonal/></border>`, // 1 filete
  `<border>${lado("left", "thin", "FF07B4E7")}${lado("right", "thin", "FF07B4E7")}${lado("top", "thin", "FF07B4E7")}${lado("bottom", "thin", "FF07B4E7")}<diagonal/></border>`, // 2 entrada
  `<border><left/><right/>${lado("top", "medium", AZUL)}<bottom/><diagonal/></border>`, // 3 total
];

const FORMATOS: [number, string][] = [
  [164, '"R$" #,##0.00;-"R$" #,##0.00;"–"'],
  [165, '#,##0;-#,##0;"·"'], // grade mensal: o "·" do zero é o mesmo da tela
  [166, "0.0%"],
  [167, "0.0"],
];

type Alinhamento = {
  h?: "left" | "center" | "right";
  v?: "top" | "center";
  wrap?: true;
  indent?: number;
};

/** [numFmtId, fonte, preenchimento, borda, alinhamento?, editável?] */
type Xf = [number, number, number, number, Alinhamento?, boolean?];

const XF = {
  padrao: [0, 0, 0, 0],
  titulo: [0, 1, 0, 0, { v: "center" }],
  subtitulo: [0, 2, 0, 0, { v: "top", wrap: true }],
  cabecalho: [0, 3, 2, 0, { v: "center", wrap: true }],
  cabecalhoN: [0, 3, 2, 0, { h: "right", v: "center", wrap: true }],
  // Com autofiltro, o botão ocupa o canto de baixo: o texto sobe.
  cabecalhoTopo: [0, 3, 2, 0, { v: "top", wrap: true }],
  cabecalhoNTopo: [0, 3, 2, 0, { h: "right", v: "top", wrap: true }],
  faixa: [0, 4, 3, 0, { v: "center" }],
  rotulo: [0, 5, 0, 1],
  rotuloRecuado: [0, 0, 0, 1, { indent: 2 }],
  texto: [0, 0, 0, 1],
  textoQuebra: [0, 0, 0, 0, { v: "top", wrap: true }],
  textoCinza: [0, 7, 0, 1],
  link: [0, 6, 0, 1],
  moeda: [164, 0, 0, 1],
  mes: [165, 0, 0, 1],
  pct: [166, 0, 0, 1],
  nota: [167, 0, 0, 1, { h: "center" }],
  inteiro: [1, 0, 0, 1, { h: "center" }],
  total: [164, 4, 3, 3],
  totalMes: [165, 4, 3, 3],
  totalPct: [166, 4, 3, 3],
  totalTexto: [0, 4, 3, 3],
  entradaMoeda: [164, 8, 4, 2, undefined, true],
  entradaMes: [165, 8, 4, 2, undefined, true],
  entradaPct: [166, 8, 4, 2, undefined, true],
  entradaTexto: [0, 8, 4, 2, undefined, true],
  cinzaMes: [165, 7, 0, 1],
  cinzaMoeda: [164, 7, 0, 1],
  destaque: [164, 9, 0, 0],
  destaquePct: [166, 9, 0, 0],
  destaqueInteiro: [1, 9, 0, 0],
} satisfies Record<string, Xf>;

export type Estilo = keyof typeof XF;
const XF_INDICE = Object.fromEntries(
  Object.keys(XF).map((k, i) => [k, i]),
) as Record<Estilo, number>;

/** Formatação condicional: a cor é sempre a mesma leitura da tela. */
const DXF = {
  /** Acima do limite, mês negativo, valor inválido. */
  alerta: `<dxf><font><b/><color rgb="FFB84300"/></font><fill><patternFill patternType="solid"><bgColor rgb="FFFDE6D8"/></patternFill></fill></dxf>`,
  /** Folga (verde da marca escurecido: #A1C520 no branco não se lê). */
  folga: `<dxf><font><color rgb="FF5F7A00"/></font></dxf>`,
  /** Diferente do pedido / da diretriz da reunião: o "mudou" da tela. */
  ajustado: `<dxf><font><b/><u/><color rgb="${AZUL}"/></font></dxf>`,
  /** Valor padrão, ainda não digitado: o itálico da tela. */
  padrao: `<dxf><font><i/><color rgb="${CINZA_CLARO}"/></font></dxf>`,
};
export type Dxf = keyof typeof DXF;
const DXF_INDICE = Object.fromEntries(
  Object.keys(DXF).map((k, i) => [k, i]),
) as Record<Dxf, number>;

function estilosXml(): string {
  const xf = ([fmt, fo, fi, bo, al, livre]: Xf) =>
    `<xf numFmtId="${fmt}" fontId="${fo}" fillId="${fi}" borderId="${bo}" xfId="0"` +
    ` applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"` +
    `${al ? ' applyAlignment="1"' : ""}${livre ? ' applyProtection="1"' : ""}>` +
    (al
      ? `<alignment${al.h ? ` horizontal="${al.h}"` : ""}${al.v ? ` vertical="${al.v}"` : ""}${al.wrap ? ' wrapText="1"' : ""}${al.indent ? ` indent="${al.indent}"` : ""}/>`
      : "") +
    // Entrada destravada: quem ligar "Proteger planilha" só edita as entradas.
    (livre ? `<protection locked="0"/>` : "") +
    `</xf>`;
  const xfs = Object.values(XF) as Xf[];
  return (
    `<styleSheet xmlns="${NS_SS}">` +
    `<numFmts count="${FORMATOS.length}">${FORMATOS.map(([id, c]) => `<numFmt numFmtId="${id}" formatCode="${attr(c)}"/>`).join("")}</numFmts>` +
    `<fonts count="${FONTES.length}">${FONTES.join("")}</fonts>` +
    `<fills count="${PREENCHIMENTOS.length}">${PREENCHIMENTOS.join("")}</fills>` +
    `<borders count="${BORDAS.length}">${BORDAS.join("")}</borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="${xfs.length}">${xfs.map(xf).join("")}</cellXfs>` +
    `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
    `<dxfs count="${Object.keys(DXF).length}">${Object.values(DXF).join("")}</dxfs>` +
    `</styleSheet>`
  );
}

// ------------------------------------------------------------------ abas

export interface Validacao {
  ref: string;
  /** Fórmula da lista (um nome definido ou um intervalo). */
  lista?: string;
  /** Sem `lista`: decimal com mínimo (e máximo, se houver). */
  min?: number;
  max?: number;
  /** Dica ao selecionar a célula (título ≤ 32 caracteres). */
  titulo?: string;
  dica?: string;
  erro: string;
}

export interface Aba {
  nome: string;
  linhas: Celula[][];
  /** Em caracteres (o Excel mede assim). */
  larguras?: number[];
  /** Altura por linha (1-based), em pontos. */
  alturas?: Record<number, number>;
  /** Linhas e colunas do topo/esquerda que ficam presas ao rolar. */
  congelar?: number;
  congelarColunas?: number;
  mesclar?: string[];
  /** Formatação condicional por expressão; a fórmula é relativa ao canto do intervalo. */
  alertas?: { ref: string; formula: string; dxf: Dxf }[];
  validacoes?: Validacao[];
  /** Cor da guia, RGB ("202C85"). */
  cor?: string;
  semGrade?: boolean;
  /** Impressão em A4 paisagem, ajustada à largura. */
  paisagem?: boolean;
  /** Intervalo do autofiltro ("A5:V300"). */
  filtro?: string;
  /** Linhas repetidas no topo de cada página impressa ("$5:$5"). */
  imprimirTitulos?: string;
  areaImpressao?: string;
  /** Colunas agrupadas (0-based, inclusive), recolhidas ou não. */
  grupoColunas?: { de: number; ate: number; recolhido?: boolean };
  /** Texto do rodapé impresso, à esquerda (à direita vai "Página N de M"). */
  rodape?: string;
}

function celulaXml(
  ref: string,
  bruta: Celula,
  links: { ref: string; url: string }[],
): string {
  if (bruta === null || bruta === "") return "";
  const c: Rica =
    typeof bruta !== "object"
      ? { v: bruta }
      : "texto" in bruta
        ? { v: bruta.texto, link: bruta.link }
        : bruta;
  const v = c.v ?? null;
  if (c.link) links.push({ ref, url: c.link });
  const s = c.s && c.s !== "padrao" ? ` s="${XF_INDICE[c.s]}"` : "";
  const num = (n: number) => (Number.isFinite(n) ? String(n) : "0");

  if (c.f) {
    const f = `<f>${esc(c.f)}</f>`;
    if (typeof v === "string")
      return `<c r="${ref}"${s} t="str">${f}<v>${esc(v)}</v></c>`;
    return `<c r="${ref}"${s}>${f}${typeof v === "number" ? `<v>${num(v)}</v>` : ""}</c>`;
  }
  // Célula com estilo e sem valor existe: é a entrada em branco (o padrão vale).
  if (v === null || v === "") return s ? `<c r="${ref}"${s}/>` : "";
  if (typeof v === "number") return `<c r="${ref}"${s}><v>${num(v)}</v></c>`;
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
}

function abaXml(
  a: Aba,
  primeira: boolean,
): { xml: string; links: { ref: string; url: string }[] } {
  const links: { ref: string; url: string }[] = [];
  const corpo = a.linhas
    .map((linha, l) => {
      const ht = a.alturas?.[l + 1];
      const celulas = linha
        .map((v, c) => celulaXml(`${coluna(c)}${l + 1}`, v, links))
        .join("");
      return `<row r="${l + 1}"${ht ? ` ht="${ht}" customHeight="1"` : ""}>${celulas}</row>`;
    })
    .join("");

  const g = a.grupoColunas;
  const pr =
    (a.cor ? `<tabColor rgb="FF${a.cor}"/>` : "") +
    (g ? `<outlinePr summaryRight="1"/>` : "") +
    (a.paisagem ? `<pageSetUpPr fitToPage="1"/>` : "");

  const xs = a.congelarColunas ?? 0;
  const ys = a.congelar ?? 0;
  const pane =
    xs || ys
      ? `<pane${xs ? ` xSplit="${xs}"` : ""}${ys ? ` ySplit="${ys}"` : ""} topLeftCell="${coluna(xs)}${ys + 1}" activePane="${xs && ys ? "bottomRight" : ys ? "bottomLeft" : "topRight"}" state="frozen"/>`
      : "";

  const larguras = a.larguras ?? [];
  const nCols = Math.max(larguras.length, g ? g.ate + 2 : 0);
  const cols = nCols
    ? `<cols>${Array.from({ length: nCols }, (_, i) => {
        const noGrupo = g && i >= g.de && i <= g.ate;
        return (
          `<col min="${i + 1}" max="${i + 1}" width="${larguras[i] ?? 9.14}" customWidth="1"` +
          (noGrupo
            ? ` outlineLevel="1"${g.recolhido ? ' hidden="1"' : ""}`
            : "") +
          (g?.recolhido && i === g.ate + 1 ? ' collapsed="1"' : "") +
          `/>`
        );
      }).join("")}</cols>`
    : "";

  let prioridade = 1;
  const condicionais = (a.alertas ?? [])
    .map(
      (r) =>
        `<conditionalFormatting sqref="${r.ref}"><cfRule type="expression" dxfId="${DXF_INDICE[r.dxf]}" priority="${prioridade++}"><formula>${esc(r.formula)}</formula></cfRule></conditionalFormatting>`,
    )
    .join("");

  const validacoes = a.validacoes?.length
    ? `<dataValidations count="${a.validacoes.length}">${a.validacoes
        .map((d) => {
          const tipo = d.lista
            ? `type="list"`
            : `type="decimal" operator="${d.max === undefined ? "greaterThanOrEqual" : "between"}"`;
          const formulas = d.lista
            ? `<formula1>${esc(d.lista)}</formula1>`
            : `<formula1>${d.min ?? 0}</formula1>${d.max === undefined ? "" : `<formula2>${d.max}</formula2>`}`;
          return (
            `<dataValidation ${tipo} allowBlank="1" showInputMessage="1" showErrorMessage="1"` +
            ` errorTitle="Valor não aceito" error="${attr(d.erro.slice(0, 255))}"` +
            (d.titulo ? ` promptTitle="${attr(d.titulo.slice(0, 32))}"` : "") +
            (d.dica ? ` prompt="${attr(d.dica.slice(0, 255))}"` : "") +
            ` sqref="${d.ref}">${formulas}</dataValidation>`
          );
        })
        .join("")}</dataValidations>`
    : "";

  // A ordem dos elementos de <worksheet> é fixa no esquema: o Excel recusa a
  // planilha inteira ("conteúdo ilegível") se um vier fora do lugar.
  const xml =
    `<worksheet xmlns="${NS_SS}" xmlns:r="${NS_REL}">` +
    (pr ? `<sheetPr>${pr}</sheetPr>` : "") +
    `<sheetViews><sheetView${a.semGrade ? ' showGridLines="0"' : ""}${primeira ? ' tabSelected="1"' : ""} workbookViewId="0">${pane}</sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="15"${g ? ' outlineLevelCol="1"' : ""}/>` +
    cols +
    `<sheetData>${corpo}</sheetData>` +
    (a.filtro ? `<autoFilter ref="${a.filtro}"/>` : "") +
    (a.mesclar?.length
      ? `<mergeCells count="${a.mesclar.length}">${a.mesclar.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>`
      : "") +
    condicionais +
    validacoes +
    (links.length
      ? `<hyperlinks>${links
          .map((h, i) => `<hyperlink ref="${h.ref}" r:id="rIdL${i + 1}"/>`)
          .join("")}</hyperlinks>`
      : "") +
    `<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.6" header="0.3" footer="0.3"/>` +
    (a.paisagem
      ? `<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>`
      : "") +
    (a.rodape
      ? `<headerFooter><oddFooter>&amp;L${esc(a.rodape.replace(/&/g, "e"))}&amp;RPágina &amp;P de &amp;N</oddFooter></headerFooter>`
      : "") +
    `</worksheet>`;
  return { xml, links };
}

/** O Excel recusa [ ] : * ? / \\ e nomes com mais de 31 caracteres. */
const nomeDeAba = (s: string) => s.replace(/[\\/*?:[\]]/g, " ").slice(0, 31);

/**
 * Pasta de trabalho com várias abas. `nomes` = nomes definidos da pasta
 * (`{ nome: "Receita", ref: "'Caixa'!$B$12" }`), usados nas fórmulas e nas
 * listas de validação.
 */
export function pasta(
  abas: Aba[],
  nomes: { nome: string; ref: string }[] = [],
): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder();
  const parte = (nome: string, xml: string) => ({
    nome,
    dados: enc.encode(XML + xml),
  });
  const abasSaneadas = abas.map((a) => ({ ...a, nome: nomeDeAba(a.nome) }));
  const geradas = abasSaneadas.map((a, i) => abaXml(a, i === 0));

  // Nomes embutidos por aba: títulos e área de impressão, e o do autofiltro.
  const definidos = [
    ...nomes.map(
      (n) => `<definedName name="${attr(n.nome)}">${esc(n.ref)}</definedName>`,
    ),
    ...abasSaneadas.flatMap((a, i) => {
      const r = refAba(a.nome);
      return [
        a.filtro
          ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${esc(`${r}!${a.filtro.replace(/([A-Z]+)(\d+)/g, "$$$1$$$2")}`)}</definedName>`
          : "",
        a.areaImpressao
          ? `<definedName name="_xlnm.Print_Area" localSheetId="${i}">${esc(`${r}!${a.areaImpressao}`)}</definedName>`
          : "",
        a.imprimirTitulos
          ? `<definedName name="_xlnm.Print_Titles" localSheetId="${i}">${esc(`${r}!${a.imprimirTitulos}`)}</definedName>`
          : "",
      ];
    }),
  ].join("");

  return zip([
    parte(
      "[Content_Types].xml",
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="${TIPO_OOXML}.sheet.main+xml"/>` +
        abasSaneadas
          .map(
            (_, i) =>
              `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="${TIPO_OOXML}.worksheet+xml"/>`,
          )
          .join("") +
        `<Override PartName="/xl/styles.xml" ContentType="${TIPO_OOXML}.styles+xml"/>` +
        `</Types>`,
    ),
    parte(
      "_rels/.rels",
      `<Relationships xmlns="${NS_PKG_REL}"><Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    parte(
      "xl/workbook.xml",
      `<workbook xmlns="${NS_SS}" xmlns:r="${NS_REL}">` +
        `<bookViews><workbookView activeTab="0"/></bookViews><sheets>` +
        abasSaneadas
          .map(
            (a, i) =>
              `<sheet name="${attr(a.nome)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
          )
          .join("") +
        `</sheets>` +
        (definidos ? `<definedNames>${definidos}</definedNames>` : "") +
        `<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`,
    ),
    parte(
      "xl/_rels/workbook.xml.rels",
      `<Relationships xmlns="${NS_PKG_REL}">` +
        abasSaneadas
          .map(
            (_, i) =>
              `<Relationship Id="rId${i + 1}" Type="${NS_REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
          )
          .join("") +
        `<Relationship Id="rId${abasSaneadas.length + 1}" Type="${NS_REL}/styles" Target="styles.xml"/>` +
        `</Relationships>`,
    ),
    parte("xl/styles.xml", estilosXml()),
    ...geradas.flatMap((g, i) => [
      parte(`xl/worksheets/sheet${i + 1}.xml`, g.xml),
      // Hiperlink externo mora numa relação da aba, não na célula.
      ...(g.links.length
        ? [
            parte(
              `xl/worksheets/_rels/sheet${i + 1}.xml.rels`,
              `<Relationships xmlns="${NS_PKG_REL}">${g.links
                .map(
                  (h, j) =>
                    `<Relationship Id="rIdL${j + 1}" Type="${NS_REL}/hyperlink" Target="${attr(h.url)}" TargetMode="External"/>`,
                )
                .join("")}</Relationships>`,
            ),
          ]
        : []),
    ]),
  ]);
}

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
  return pasta([{ nome: aba, linhas, larguras, congelar }]);
}

export const TIPO_XLSX = `${TIPO_OOXML}.sheet`;
