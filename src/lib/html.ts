/**
 * O texto rico da origem, seguro para exibir.
 *
 * O sistema de submissão guarda alguns campos como HTML de editor: **os 97
 * pareceres da ASEEC**, e `justification`/`expected_results` em 5 projetos.
 * O painel os desenhava como texto, então a mesa lia `<p>Projeto bem
 * estruturado</p><strong>Score: 70/100</strong>` na tela.
 *
 * Renderizar HTML de outro sistema é fronteira de confiança: quem escreve o
 * parecer digita num formulário que este painel não controla. Por isso o texto
 * passa por uma lista de permissão antes de virar `dangerouslySetInnerHTML` —
 * e o que passa perde **todos os atributos**, que é o que mataria `onerror=`,
 * `style=` e `href="javascript:"`. Sem biblioteca: são 40 linhas, e o Node não
 * tem DOM para emprestar.
 */

/**
 * O que o editor da origem realmente emite: p, strong, br, span, li, ol
 * (medido nos 97 pareceres). O resto da lista é o que o mesmo editor emite
 * quando alguém usa o botão — não custa e evita ter que voltar aqui.
 *
 * `span` fica de FORA de propósito: sem atributos ele não formata nada, e sem
 * ele não sobra tag inútil no meio do texto.
 */
const PERMITIDAS = new Set([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "ul",
  "ol",
  "li",
  "blockquote",
]);

/** Tags cujo CONTEÚDO também tem de sumir — tirar só a marca deixaria o código. */
const COM_CORPO =
  /<(script|style|iframe|object|embed|svg|math)\b[\s\S]*?<\/\1\s*>/gi;

/** Vale a pena tratar como HTML? Texto puro com um "<" solto não vale. */
export function ehHtmlRico(texto: string): boolean {
  return /<(p|br|strong|b|em|i|u|s|ul|ol|li|blockquote|h[1-6]|div|span)\b[^>]*>/i.test(
    texto,
  );
}

/**
 * Devolve o mesmo texto com só as tags da lista, todas sem atributo. O que não
 * está na lista é removido **mantendo o texto de dentro** (um `<span>` some,
 * a frase dele fica). Entidades (`&nbsp;`, `&amp;`) passam intactas.
 */
export function sanitizarHtml(texto: string): string {
  return (
    texto
      .replace(COM_CORPO, "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (_, barra, nome) => {
        const tag = (nome as string).toLowerCase();
        if (!PERMITIDAS.has(tag)) return "";
        return barra ? `</${tag}>` : tag === "br" ? "<br>" : `<${tag}>`;
      })
      // O editor marca linha em branco como `<p><br></p>`: com o espaçamento
      // entre parágrafos do painel, isso abriria um vão de três linhas.
      .replace(/<p>(?:\s|<br>|&nbsp;)*<\/p>/gi, "")
      .trim()
  );
}
