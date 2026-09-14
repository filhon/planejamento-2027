import { dados } from "@/lib/cache";
import {
  geometriaBrasil,
  geometriaMundo,
  VIEW_BOX,
  VIEW_BOX_BR,
} from "@/lib/mapa";
import Parcerias from "./parcerias";

/**
 * Parcerias proativas (Fase 11): onde as agências têm missionário e a Hebron
 * ainda não chegou. As projeções (mundo e Brasil) rodam aqui; o cliente
 * recebe paths e pontos já em x/y, e só os municípios que algum missionário
 * cita (os 5.570 do CSV não precisam ir para o navegador).
 */
export default async function Page() {
  const { missionarios, municipios, candidatos } = await dados.parcerias();
  const br = geometriaBrasil();

  const citados = new Set(missionarios.map((m) => m.codigoIbge));
  const pontos = municipios
    .filter((m) => citados.has(m.codigo))
    .map((m) => {
      const xy = br.projetar([m.lon, m.lat]);
      return { ...m, x: xy?.[0] ?? 0, y: xy?.[1] ?? 0 };
    });

  return (
    <Parcerias
      geoMundo={geometriaMundo()}
      viewBoxMundo={VIEW_BOX}
      geoBr={br.ufs}
      viewBoxBr={VIEW_BOX_BR}
      missionarios={missionarios}
      municipios={pontos}
      candidatosIniciais={candidatos}
    />
  );
}
