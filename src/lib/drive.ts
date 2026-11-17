/**
 * Link do Google Drive → a URL que o navegador embute num `<iframe>`.
 *
 * Por que existe: a prestação de contas de 2025 quase nunca subiu no sistema de
 * submissão (25 de 223 projetos aprovados), mas a secretaria tem os arquivos no
 * Drive. O link colado no painel (Firestore do painel, `prestacao_links`) abre no MESMO visor
 * dos anexos do projeto — e é o Drive que renderiza, então PDF, planilha, .docx
 * e imagem funcionam sem nada disso passar pelo painel.
 *
 * O link normal do Drive (`/view`, `/edit`) recusa ser embutido; o `/preview`
 * (e o `embeddedfolderview` das pastas) é a forma que o Google publica para
 * isso. A conversão é toda em regex sobre a URL — nenhuma chamada à API do
 * Google, nenhuma credencial, nada sai daqui.
 *
 * ⚠️ O arquivo precisa estar compartilhado como "qualquer pessoa com o link
 * pode ver"; sem isso o quadro mostra a tela de permissão do Google.
 */

/** Id do Drive: letras, números, `-` e `_`. */
const ID = "[\\w-]+";

const PASTA = new RegExp(
  `drive\\.google\\.com/drive/(?:u/\\d+/)?folders/(${ID})`,
);
const WORKSPACE = new RegExp(
  `docs\\.google\\.com/(document|spreadsheets|presentation)/d/(${ID})`,
);
const ARQUIVO = new RegExp(
  `drive\\.google\\.com/(?:file/d/(${ID})|(?:open|uc)\\?(?:[^#]*&)?id=(${ID}))`,
);

/** A URL embutível, ou `null` quando o link não é do Drive. */
export function embedDrive(url: string): string | null {
  const u = url.trim();

  const pasta = PASTA.exec(u);
  if (pasta) {
    // A pasta vira a lista de arquivos dela dentro do visor — é o caso comum
    // quando a secretaria guarda uma pasta por projeto.
    return `https://drive.google.com/embeddedfolderview?id=${pasta[1]}#list`;
  }

  const workspace = WORKSPACE.exec(u);
  if (workspace) {
    return `https://docs.google.com/${workspace[1]}/d/${workspace[2]}/preview`;
  }

  const arquivo = ARQUIVO.exec(u);
  const id = arquivo?.[1] ?? arquivo?.[2];
  return id ? `https://drive.google.com/file/d/${id}/preview` : null;
}

/** Nome de exibição quando a equipe não deu rótulo ao link. */
export function rotuloDrive(url: string): string {
  return PASTA.test(url) ? "Pasta no Drive" : "Prestação de contas (Drive)";
}
