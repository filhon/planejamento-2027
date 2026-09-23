import { query } from "./db";
import { usuariosPermitidos } from "./sessao";

/**
 * Confere e-mail e senha contra os MESMOS usuários do sistema de submissão
 * (Supabase Auth), sem gravar nada na origem e sem o hash sair do banco:
 * `extensions.crypt` (pgcrypto, já instalado lá) refaz o bcrypt dentro do
 * Postgres e a consulta só devolve o id quando bate.
 *
 * Única leitura do schema `auth` no painel — e restrita aos ids de
 * PAINEL_USUARIOS: senha válida de qualquer outra pessoa (parceiro, outro
 * diretor) não entra. Banido ou apagado lá, barrado aqui também.
 */
export async function conferirSenha(
  email: string,
  senha: string,
): Promise<{ uid: string; nome: string } | null> {
  const ids = usuariosPermitidos();
  if (!ids.length) return null;
  const rows = await query<{ uid: string; nome: string | null }>(
    `select u.id::text as uid, p.name as nome
       from auth.users u
       left join profiles p on p.user_id = u.id
      where u.id = any($1::uuid[])
        and lower(u.email) = lower($2)
        and u.encrypted_password <> ''
        and u.encrypted_password = extensions.crypt($3, u.encrypted_password)
        and u.email_confirmed_at is not null
        and u.deleted_at is null
        and (u.banned_until is null or u.banned_until <= now())`,
    [ids, email, senha],
  );
  const r = rows[0];
  return r ? { uid: r.uid, nome: r.nome ?? email } : null;
}
