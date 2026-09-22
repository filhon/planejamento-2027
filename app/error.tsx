"use client";

/**
 * Rede de segurança para o dia da reunião: se a origem estiver fora do ar (ou a
 * senha do .env.local faltar), a tela diz o que houve e oferece nova tentativa,
 * em vez de uma página em branco.
 */
export default function Erro({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main>
      <div className="erro cartao">
        <h1 className="titulo">O painel não conseguiu ler os dados</h1>
        <p>
          A leitura do banco de submissões falhou — nada foi alterado lá. Tente
          de novo; se insistir, chame quem cuida do sistema e mostre a linha
          abaixo (costuma ser a internet ou a senha em <code>.env.local</code>).
        </p>
        <code>{error.message}</code>
        <p style={{ marginTop: 20 }}>
          <button className="botao-atualizar" onClick={reset}>
            Tentar de novo
          </button>
        </p>
      </div>
    </main>
  );
}
