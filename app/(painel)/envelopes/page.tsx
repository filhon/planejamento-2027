import { dados } from "@/lib/cache";
import { ehChaveDeProjeto, receitaDoSistema } from "@/lib/envelopes";
import { firestore } from "@/lib/firestore";
import {
  carregarDecisoes,
  carregarEnvelopes,
  falhaDoBanco,
  lerAdministrativo,
  lerCaixa,
} from "@/lib/painel-db";
import Envelopes from "./envelopes";

/**
 * Envelopes da diretriz (Fases 15 e 15b): caixa mês a mês, envelopes no ano e
 * a lista de projetos, com envelope, mês a mês, receita e administrativo
 * editáveis pela mesa.
 *
 * O que a mesa grava e as decisões da pasta vêm do Firestore a cada
 * requisição, sem o cache de 15 min da origem: três pessoas editam ao mesmo
 * tempo, e cada uma precisa ver o que a outra salvou ao recarregar.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ envelope?: string }>;
}) {
  const { envelope } = await searchParams;
  const ciclos = await dados.ciclos();
  const anos = [...new Set(ciclos.map((c) => c.ano))];

  const [orcamentos, ajustes, decisoes, digitados] = await Promise.all([
    Promise.all(anos.map((a) => dados.orcamento(a))),
    carregarEnvelopes(),
    carregarDecisoes(),
    Promise.all(
      anos.map(async (a) => {
        const [caixa, admin] = await Promise.all([
          lerCaixa(a),
          lerAdministrativo(a),
        ]);
        return [a, { ...caixa, admin }] as const;
      }),
    ),
  ]);

  return (
    <Envelopes
      // Recarregar (ou o "Atualizar") remonta a tela com o que está no banco;
      // entre uma carga e outra, o estado local da tela é quem manda.
      key={Date.now()}
      sistema={Object.fromEntries(
        orcamentos.map((o) => [
          o.ano,
          {
            receita: receitaDoSistema(o),
            teto: o.tetoTotal,
            admin: o.custosAdministrativos,
          },
        ]),
      )}
      digitadosIniciais={Object.fromEntries(digitados)}
      ajustesIniciais={Object.fromEntries(ajustes)}
      decisoes={Object.fromEntries(decisoes)}
      gravavel={firestore() !== null && !falhaDoBanco()}
      falhaBanco={falhaDoBanco()}
      envelopeInicial={
        envelope === "sem" || ehChaveDeProjeto(envelope) ? envelope : null
      }
    />
  );
}
