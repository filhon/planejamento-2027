/**
 * Leitor mínimo de .xlsx — o suficiente para MOSTRAR a planilha na tela, não
 * para recalcular nada. Contrapartida do escritor em `xlsx.ts`.
 *
 * Por que existe: 220 dos anexos de 2026 são .xlsx (quase todos o orçamento
 * detalhado), e até aqui abrir um deles na reunião significava baixar o arquivo
 * e sair do painel. Um .xlsx é um zip de XMLs — o navegador já sabe inflar
 * (`DecompressionStream`) e o resto é ler três XMLs com regex. Sem biblioteca:
 * a alternativa (SheetJS) traz ~800 kB para renderizar tabela de texto.
 *
 * Puro: roda no cliente (o visor) e no Node (o teste). Nada de `fs`/`pg`.
 *
 * ponytail: só valores. Não traz mesclagem, imagem coladas na aba, largura de
 * coluna nem fórmula (mostra o resultado que o Excel gravou). Se a mesa
 * reclamar de fidelidade, o caminho é o link "abrir original", que continua ali.
 */

// ------------------------------------------------------------------- zip

/** Descompacta uma entrada `deflate`; método 0 (armazenado) sai como está. */
async function inflar(bytes: Uint8Array, metodo: number): Promise<Uint8Array> {
  if (metodo === 0) return bytes;
  if (metodo !== 8) throw new Error(`método de compressão ${metodo}`);
  const fluxo = new Response(bytes as BufferSource).body!.pipeThrough(
    new DecompressionStream("deflate-raw"),
  );
  return new Uint8Array(await new Response(fluxo).arrayBuffer());
}

/**
 * Índice do zip pelo diretório central (é ele que vale — o cabeçalho local
 * pode ter tamanho zero quando o gravador usou data descriptor).
 *
 * ponytail: sem zip64. O maior anexo .xlsx da origem tem 429 kB; o limite do
 * formato clássico é 4 GB por entrada.
 */
function abrirZip(dados: Uint8Array) {
  const v = new DataView(dados.buffer, dados.byteOffset, dados.byteLength);
  const utf8 = new TextDecoder();

  let fim = -1;
  for (
    let i = dados.length - 22;
    i >= 0 && i > dados.length - 22 - 65536;
    i--
  ) {
    if (v.getUint32(i, true) === 0x06054b50) {
      fim = i;
      break;
    }
  }
  if (fim < 0)
    throw new Error("não é um zip (fim do diretório não encontrado)");

  const entradas = new Map<string, { pos: number; tam: number; met: number }>();
  let p = v.getUint32(fim + 16, true);
  for (let n = v.getUint16(fim + 10, true); n > 0; n--) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const tamNome = v.getUint16(p + 28, true);
    const nome = utf8.decode(dados.subarray(p + 46, p + 46 + tamNome));
    entradas.set(nome, {
      pos: v.getUint32(p + 42, true),
      tam: v.getUint32(p + 20, true),
      met: v.getUint16(p + 10, true),
    });
    p += 46 + tamNome + v.getUint16(p + 30, true) + v.getUint16(p + 32, true);
  }

  return {
    tem: (nome: string) => entradas.has(nome),
    /** Lê UMA entrada — as mídias coladas na planilha nunca são infladas. */
    async texto(nome: string): Promise<string> {
      const e = entradas.get(nome);
      if (!e) return "";
      // O nome/extra do cabeçalho local tem tamanho próprio, diferente do central.
      const dados0 =
        e.pos +
        30 +
        v.getUint16(e.pos + 26, true) +
        v.getUint16(e.pos + 28, true);
      return utf8.decode(
        await inflar(dados.subarray(dados0, dados0 + e.tam), e.met),
      );
    },
  };
}

// ------------------------------------------------------------------- xml

const ENTIDADES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function desescapar(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (todo, corpo: string) => {
    if (corpo[0] === "#") {
      const n = Number.parseInt(
        corpo.slice(corpo[1] === "x" || corpo[1] === "X" ? 2 : 1),
        corpo[1] === "x" || corpo[1] === "X" ? 16 : 10,
      );
      return Number.isFinite(n) ? String.fromCodePoint(n) : todo;
    }
    return ENTIDADES[corpo.toLowerCase()] ?? todo;
  });
}

const atributo = (tag: string, nome: string): string | undefined =>
  new RegExp(`${nome}="([^"]*)"`).exec(tag)?.[1];

/** Todo o texto de um trecho — `<si>` e `<is>` podem vir quebrados em runs. */
function textos(trecho: string): string {
  let s = "";
  for (const m of trecho.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) s += m[1]!;
  return desescapar(s);
}

/** "AB12" → 27. Nulo quando a célula não declara referência. */
function colunaDe(ref: string | undefined): number | null {
  const letras = ref && /^([A-Z]+)/.exec(ref)?.[1];
  if (!letras) return null;
  let n = 0;
  for (const ch of letras) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

// --------------------------------------------------------------- formatos

/** Ids embutidos de data/hora — esses não trazem `formatCode` no styles.xml. */
const ID_DATA = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

const casas = (codigo: string) =>
  Math.min(/\.(0+)/.exec(codigo.split(";")[0]!)?.[1]?.length ?? 0, 6);

/**
 * Formata pelo que a própria planilha pediu. Só três leituras importam num
 * orçamento — dinheiro, percentual e data; o resto sai como está, porque
 * agrupar por reflexo transformaria o ano "2026" em "2.026".
 */
function formatar(n: number, codigo: string | undefined, id: number): string {
  if (ID_DATA.has(id)) return dataDeSerial(n);
  if (!codigo) return String(n);
  // Cor, condição e literais entre aspas não dizem nada sobre o número.
  const limpo = desescapar(codigo).replace(/\[[^\]]*\]|"[^"]*"|\\./g, "");
  if (limpo.includes("%")) {
    return `${(n * 100).toFixed(casas(limpo))}%`.replace(".", ",");
  }
  if (/[ymd]{2,}|\bd\/|\/m/i.test(limpo)) return dataDeSerial(n);
  if (!/[#0]/.test(limpo)) return String(n);
  const d = casas(limpo);
  const s = n.toLocaleString("pt-BR", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
  return /R\$/.test(desescapar(codigo)) ? `R$ ${s}` : s;
}

/** Serial do Excel → dd/mm/aaaa (a época é 1899-12-30, com o bug de 1900). */
function dataDeSerial(n: number): string {
  const ms = Date.UTC(1899, 11, 30) + Math.round(n) * 86_400_000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return String(n);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

// ----------------------------------------------------------------- leitura

export interface AbaLida {
  nome: string;
  /** Já aparado: sem linhas/colunas vazias na borda. */
  linhas: string[][];
  /** Quantas linhas a aba tem quando o teto cortou; senão, igual a `linhas`. */
  linhasTotal: number;
}

export interface OpcoesLeitura {
  /** Teto por aba, para uma planilha de 20 mil linhas não travar a reunião. */
  maxLinhas?: number;
  maxColunas?: number;
}

export async function lerXlsx(
  dados: ArrayBuffer | Uint8Array,
  { maxLinhas = 400, maxColunas = 40 }: OpcoesLeitura = {},
): Promise<AbaLida[]> {
  const zip = abrirZip(
    dados instanceof Uint8Array ? dados : new Uint8Array(dados),
  );

  // Textos compartilhados: a maioria das células de texto é só um índice aqui.
  const compartilhados: string[] = [];
  if (zip.tem("xl/sharedStrings.xml")) {
    const xml = await zip.texto("xl/sharedStrings.xml");
    for (const m of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      compartilhados.push(textos(m[1]!));
    }
  }

  // styles.xml: de cada índice de estilo, o formato numérico que ele aponta.
  const codigoDoFormato = new Map<number, string>();
  const formatoDoEstilo: number[] = [];
  if (zip.tem("xl/styles.xml")) {
    const xml = await zip.texto("xl/styles.xml");
    for (const m of xml.matchAll(/<numFmt\b[^>]*\/?>/g)) {
      const id = Number(atributo(m[0], "numFmtId"));
      const codigo = atributo(m[0], "formatCode");
      if (Number.isFinite(id) && codigo) codigoDoFormato.set(id, codigo);
    }
    // Só os <xf> de <cellXfs> — os de <cellStyleXfs>, antes deles, são outra lista.
    const bloco = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml)?.[1] ?? "";
    for (const m of bloco.matchAll(/<xf\b[^>]*>/g)) {
      formatoDoEstilo.push(Number(atributo(m[0], "numFmtId") ?? 0));
    }
  }

  // Ordem e nome das abas saem do workbook; o arquivo de cada uma, das rels.
  const wb = await zip.texto("xl/workbook.xml");
  const rels = await zip.texto("xl/_rels/workbook.xml.rels");
  const alvos = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = atributo(m[0], "Id");
    const alvo = atributo(m[0], "Target");
    if (id && alvo) {
      alvos.set(id, alvo.startsWith("/") ? alvo.slice(1) : `xl/${alvo}`);
    }
  }

  const abas: AbaLida[] = [];
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const arquivo = alvos.get(atributo(m[0], "r:id") ?? "");
    if (!arquivo || !zip.tem(arquivo)) continue;
    const aba = lerAba(
      await zip.texto(arquivo),
      { compartilhados, codigoDoFormato, formatoDoEstilo },
      maxLinhas,
      maxColunas,
    );
    aba.nome = desescapar(atributo(m[0], "name") ?? `Aba ${abas.length + 1}`);
    abas.push(aba);
  }
  return abas;
}

function lerAba(
  xml: string,
  ctx: {
    compartilhados: string[];
    codigoDoFormato: Map<number, string>;
    formatoDoEstilo: number[];
  },
  maxLinhas: number,
  maxColunas: number,
): AbaLida {
  const linhas: string[][] = [];
  let linhasTotal = 0;

  for (const mr of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    linhasTotal++;
    if (linhas.length >= maxLinhas) continue;

    const celulas: string[] = [];
    let i = 0;
    for (const mc of mr[1]!.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const c = colunaDe(atributo(mc[1]!, "r")) ?? i;
      i = c + 1;
      if (c >= maxColunas) continue;
      const valor = valorDaCelula(mc[1]!, mc[2] ?? "", ctx);
      if (valor) celulas[c] = valor;
    }
    // Buracos viram string vazia: o `<td>` precisa existir para a coluna alinhar.
    linhas.push(
      Array.from({ length: celulas.length }, (_, j) => celulas[j] ?? ""),
    );
  }

  const cortou = linhasTotal > linhas.length;
  const aparadas = aparar(linhas).linhas;
  // Sem corte, o total é o que sobrou: as linhas vazias do fim não existem para
  // quem lê, e "16 de 25" com 9 linhas em branco só assustaria a mesa.
  return {
    nome: "",
    linhas: aparadas,
    linhasTotal: cortou ? linhasTotal : aparadas.length,
  };
}

function valorDaCelula(
  attrs: string,
  corpo: string,
  ctx: {
    compartilhados: string[];
    codigoDoFormato: Map<number, string>;
    formatoDoEstilo: number[];
  },
): string {
  const tipo = atributo(attrs, "t") ?? "n";
  if (tipo === "inlineStr") return textos(corpo).trim();

  const bruto = /<v>([\s\S]*?)<\/v>/.exec(corpo)?.[1];
  if (bruto === undefined) return "";
  if (tipo === "s") return (ctx.compartilhados[Number(bruto)] ?? "").trim();
  if (tipo === "str" || tipo === "e") return desescapar(bruto).trim();
  if (tipo === "b") return bruto === "1" ? "VERDADEIRO" : "FALSO";

  const n = Number(bruto);
  if (!Number.isFinite(n)) return desescapar(bruto).trim();
  const idFormato = ctx.formatoDoEstilo[Number(atributo(attrs, "s") ?? 0)] ?? 0;
  return formatar(n, ctx.codigoDoFormato.get(idFormato), idFormato);
}

/** Corta linhas e colunas vazias das bordas — a aba costuma sobrar em branco. */
function aparar(linhas: string[][]): { linhas: string[][] } {
  while (linhas.length && linhas.at(-1)!.every((c) => !c)) linhas.pop();
  const largura = linhas.reduce((max, l) => {
    let fim = 0;
    l.forEach((c, i) => c && (fim = i + 1));
    return Math.max(max, fim);
  }, 0);
  return {
    linhas: linhas.map((l) =>
      Array.from({ length: largura }, (_, i) => l[i] ?? ""),
    ),
  };
}
