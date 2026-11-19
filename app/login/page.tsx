import Formulario from "./formulario";

export const metadata = { title: "Entrar — Hebron ASEEC" };

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; expirou?: string }>;
}) {
  const { de, expirou } = await searchParams;
  return (
    <main className="login">
      <div className="login-cartao">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/simbolo.png" alt="" width={34} height={50} />
        <p className="login-marca">Hebron ASEEC</p>
        <h1 className="titulo">Painel Consultivo</h1>
        <p className="login-sub">
          Acesso restrito à diretoria. Use o e-mail e a senha do sistema de
          submissão.
        </p>
        {expirou && (
          <p className="login-aviso" role="status">
            Sua sessão terminou. Entre de novo para continuar de onde parou.
          </p>
        )}
        <Formulario de={typeof de === "string" ? de : "/"} />
        <p className="login-ajuda">
          Esqueceu a senha? Redefina no{" "}
          <a
            href="https://sistema.hebronaseec.com.br"
            target="_blank"
            rel="noopener noreferrer"
          >
            sistema de submissão
          </a>
          ; a nova vale aqui também.
        </p>
      </div>
    </main>
  );
}
