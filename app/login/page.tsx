import Formulario from "./formulario";

export const metadata = { title: "Entrar — Hebron ASEEC" };

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ de?: string }>;
}) {
  const { de } = await searchParams;
  return (
    <main className="login">
      <div className="login-cartao">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/simbolo.png" alt="" width={34} height={50} />
        <h1 className="titulo">Painel Consultivo</h1>
        <p className="login-sub">
          Entre com o mesmo e-mail e senha do sistema de submissão.
        </p>
        <Formulario de={typeof de === "string" ? de : "/"} />
      </div>
    </main>
  );
}
