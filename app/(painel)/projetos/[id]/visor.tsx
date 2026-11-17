"use client";

import { useEffect, useRef, useState } from "react";
import { embedDrive } from "@/lib/drive";
import type { Anexo } from "@/lib/types";
import type { AbaLida } from "@/lib/xlsx-ler";
import { tamanhoArquivo } from "../../formato";

/**
 * O visor de anexos — o documento abre DENTRO da página, numa janela sobre ela.
 *
 * Antes, todo anexo era um link para outra guia: PDF ainda dava, mas planilha
 * (220 dos anexos de 2026, quase sempre o orçamento detalhado) virava download
 * e Excel abrindo por cima da reunião. Sair do painel no meio da avaliação é
 * perder o recorte, o projeto e a sala.
 *
 *  - PDF        → o próprio leitor do navegador, num `<iframe>`
 *  - imagem     → `<img>`
 *  - .xlsx      → lida no cliente e desenhada como tabela (`src/lib/xlsx-ler.ts`)
 *  - Drive      → o `/preview` do Google, que renderiza tudo (src/lib/drive.ts)
 *  - o resto    → a mensagem e o link do original (.docx, .xls, .ods)
 *
 * É um `<dialog>` nativo: modal, Esc fecha, foco preso pelo navegador. Sem
 * biblioteca de modal, sem rota de proxy — os buckets são públicos e respondem
 * com `Access-Control-Allow-Origin: *`, então o `fetch` da planilha sai daqui
 * mesmo. O link "abrir original" continua ali para quem quiser a fidelidade
 * total (mesclagem, imagem colada na aba, fórmula) no Excel.
 */

type Formato = "pdf" | "imagem" | "planilha" | "outro";

/** Link colado não tem nome de arquivo — aí a extensão sai da própria URL. */
function formatoDe(nome: string, url: string): Formato {
  const ext = (/\.([a-z0-9]+)$/i.exec(nome) ??
    /\.([a-z0-9]+)$/i.exec(url.split(/[?#]/)[0] ?? ""))?.[1]?.toLowerCase();
  if (ext === "pdf") return "pdf";
  if (["png", "jpg", "jpeg", "gif", "webp", "jfif", "bmp"].includes(ext ?? ""))
    return "imagem";
  if (ext === "xlsx") return "planilha";
  return "outro";
}

// ------------------------------------------------------------- a planilha

function Planilha({ url }: { url: string }) {
  const [abas, setAbas] = useState<AbaLida[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [i, setI] = useState(0);

  useEffect(() => {
    let vivo = true;
    setAbas(null);
    setErro(null);
    setI(0);
    (async () => {
      try {
        // O leitor só entra no bundle quando alguém abre uma planilha.
        const [{ lerXlsx }, resposta] = await Promise.all([
          import("@/lib/xlsx-ler"),
          fetch(url),
        ]);
        if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
        const lidas = await lerXlsx(await resposta.arrayBuffer());
        if (vivo) setAbas(lidas.length ? lidas : []);
      } catch (e) {
        if (vivo) setErro(e instanceof Error ? e.message : "falha na leitura");
      }
    })();
    return () => {
      vivo = false;
    };
  }, [url]);

  if (erro) {
    return (
      <p className="visor-aviso">
        Não deu para ler a planilha aqui ({erro}). Abrir o original resolve.
      </p>
    );
  }
  if (!abas) return <p className="visor-aviso">Lendo a planilha…</p>;

  const aba = abas[i];
  if (!aba || aba.linhas.length === 0) {
    return (
      <>
        {abas.length > 1 && <Abas abas={abas} atual={i} escolher={setI} />}
        <p className="visor-aviso">
          Esta aba não tem células preenchidas. É comum em planilha montada com
          imagens coladas, que só o original mostra.
        </p>
      </>
    );
  }

  return (
    <>
      {abas.length > 1 && <Abas abas={abas} atual={i} escolher={setI} />}
      <div className="visor-tabela">
        <table>
          <tbody>
            {aba.linhas.map((linha, l) => (
              <tr key={l}>
                {linha.map((celula, c) => (
                  <td key={c} className={ehNumero(celula) ? "num" : undefined}>
                    {celula}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {aba.linhasTotal > aba.linhas.length && (
        <p className="visor-aviso">
          Mostrando as {aba.linhas.length} primeiras de {aba.linhasTotal}{" "}
          linhas. O original tem o resto.
        </p>
      )}
    </>
  );
}

/** Alinhar número à direita é o que faz a coluna de valores ser lida como coluna. */
const ehNumero = (v: string) => /^[R$\s]*-?[\d.,]+%?$/.test(v) && /\d/.test(v);

function Abas({
  abas,
  atual,
  escolher,
}: {
  abas: AbaLida[];
  atual: number;
  escolher: (i: number) => void;
}) {
  return (
    <div className="visor-abas">
      {abas.map((a, i) => (
        <button
          key={i}
          type="button"
          className={i === atual ? "ativa" : undefined}
          onClick={() => escolher(i)}
        >
          {a.nome}
        </button>
      ))}
    </div>
  );
}

// --------------------------------------------------------------- o visor

function Visor({ anexo, fechar }: { anexo: Anexo; fechar: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  // Drive manda no visor quando é Drive: quem renderiza é o Google, e aí PDF,
  // planilha, .docx e pasta inteira abrem sem o painel saber ler nenhum deles.
  const drive = embedDrive(anexo.url);
  const formato = formatoDe(anexo.nome, anexo.url);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className="visor"
      onClose={fechar}
      onClick={(e) => {
        // Clique no fundo (fora do conteúdo) fecha — o alvo é o próprio dialog.
        if (e.target === ref.current) ref.current?.close();
      }}
    >
      <header>
        <b>{anexo.nome}</b>
        <span className="sub">
          {anexo.tipo}
          {tamanhoArquivo(anexo.bytes) && ` · ${tamanhoArquivo(anexo.bytes)}`}
        </span>
        <a href={anexo.url} target="_blank" rel="noopener noreferrer">
          Abrir original ↗
        </a>
        {/* `?download=` é do Storage do Supabase; no Drive quebraria o link, e
            o próprio quadro do Google já traz o botão de baixar. */}
        {!drive && (
          <a href={`${anexo.url}?download=${encodeURIComponent(anexo.nome)}`}>
            Baixar
          </a>
        )}
        <button type="button" onClick={() => ref.current?.close()}>
          Fechar ✕
        </button>
      </header>

      <div className="visor-corpo">
        {drive && <iframe src={drive} title={anexo.nome} />}
        {!drive && formato === "pdf" && (
          <iframe src={anexo.url} title={anexo.nome} />
        )}
        {!drive && formato === "imagem" && (
          <img src={anexo.url} alt={anexo.nome} />
        )}
        {!drive && formato === "planilha" && <Planilha url={anexo.url} />}
        {!drive && formato === "outro" && (
          <p className="visor-aviso">
            O navegador não abre este formato na página. "Abrir original" manda
            para a guia nova; "Baixar" salva o arquivo.
          </p>
        )}
      </div>
    </dialog>
  );
}

// ------------------------------------------------------------- a listagem

/**
 * O tipo do anexo é o que se procura ("o orçamento"); o nome do arquivo repete
 * o título do projeto e quebrava em três linhas sublinhadas na coluna estreita.
 * O botão leva o tipo, e o nome vai embaixo, em cinza.
 */
const ROTULO_TIPO_ANEXO: Record<string, string> = {
  orcamento: "Orçamento",
  cronograma: "Cronograma",
  portfolio: "Portfólio",
  video: "Vídeo",
};

function rotuloTipoAnexo(a: Anexo): string {
  const t = a.tipo?.trim();
  // O link colado tem rótulo curado pela secretaria; o tipo dele é a origem
  // ("Drive · fora do sistema"), que vai embaixo.
  if (!t || a.id.startsWith("link:")) return a.nome;
  return ROTULO_TIPO_ANEXO[t] ?? t.charAt(0).toUpperCase() + t.slice(1);
}

export default function ListaAnexos({ anexos }: { anexos: Anexo[] }) {
  const [aberto, setAberto] = useState<Anexo | null>(null);
  if (anexos.length === 0) return <p className="sub">Nenhum anexo.</p>;

  return (
    <>
      <ul className="anexos">
        {anexos.map((a) => (
          <li key={a.id}>
            {a.url ? (
              <button
                type="button"
                className="anexo-abrir"
                onClick={() => setAberto(a)}
              >
                {rotuloTipoAnexo(a)}
              </button>
            ) : (
              <span title="Arquivo sem endereço público: falar com a secretaria">
                {rotuloTipoAnexo(a)}
              </span>
            )}
            <span className="sub">
              {rotuloTipoAnexo(a) !== a.nome ? a.nome : a.tipo}
              {tamanhoArquivo(a.bytes) && ` · ${tamanhoArquivo(a.bytes)}`}
              {/* No papel o anexo vira botão sem destino: a URL sai por extenso
                  para ser digitável (a folha esconde o que não for do papel). */}
              {a.url && <span className="so-impressao-inline"> · {a.url}</span>}
            </span>
          </li>
        ))}
      </ul>
      {aberto && <Visor anexo={aberto} fechar={() => setAberto(null)} />}
    </>
  );
}
