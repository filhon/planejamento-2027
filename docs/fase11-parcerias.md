# Fase 11 — Parcerias proativas (`/parcerias`)

A tela do diretor para **tomar a iniciativa**: em vez de esperar o projeto
chegar, ver onde as agências parceiras já têm missionário e a Hebron ainda não
chegou — e marcar quem abraçar na próxima remessa.

## As duas perguntas

**Mundo** — "onde APMT, JMM e Pioneiros têm gente e não veio pedido nesta remessa?"

| Cor no mapa            | Regra                                                                                           | 2026 (sem filtro) |
| ---------------------- | ----------------------------------------------------------------------------------------------- | ----------------- |
| Laranja — _Sem pedido_ | agência lá; nenhum projeto **avaliável** (rejeitado, rascunho e cancelado não "atingem" o país) | 56 países         |
| Verde — _Retomar_      | idem, mas havia projeto **aprovado** no ciclo anterior                                          | 16 países         |
| Azul — _Atendido_      | há pedido nesta remessa (com ou sem agência)                                                    | —                 |
| Cinza                  | nem agência nem pedido                                                                          | —                 |

Intensidade = nº de missionários. O ranking à direita traz só laranja/verde,
retomar primeiro, depois quem tem **mais de uma agência**, depois mais gente.

**Brasil** — "qual UF ficou sem projeto, e quem da JMN (IPB ou CBB) está lá?"

- UF laranja = zero projetos avaliáveis na remessa (7 em 2026: MT, PI, SC, TO,
  SE, RN, RJ — **todas com missionário JMN**).
- Ponto = cidade com missionário; **verde = top 100** do ranking de demanda por
  produtos Hebron (retribuição a quem mais compra). Tamanho = quantos.
- Cada UF mostra o **melhor candidato**: o missionário na cidade de maior
  demanda daquela UF.

Roda do mouse aproxima, arrastar move, duplo clique volta. `/parcerias#brasil`
abre direto no Brasil.

**Da UF para os projetos:** com uma UF selecionada no mapa, o cabeçalho da
tabela ganha "Ver N projetos submetidos em Projetos & Pastas →" — aplica o
filtro global **UF** (`Filtros.uf`, casado por `ufDe(p.estado)`) e vai para
`/projetos`. A UF aparece como ficha na barra de filtros (✕ tira), entra no
resumo do recorte da impressão/exportação e sobrevive à troca de página, como o
país clicado no Mapa-múndi. É "submetido" no sentido de _está na remessa_: o
Status continua sendo o filtro dele.

## Filtros globais nesta tela

Só dois valem, e cada um age numa base diferente:

- **Status** recorta os _pedidos_ que contam como "atingido" — "Status =
  Aprovado" responde "onde não há projeto aprovado", que é outra pergunta útil.
- **Continente** recorta os _missionários_ (só no modo Mundo; regiões sensíveis
  e JMN ficam).

Os outros (Categoria, Instituição, Triagem, Responsável, Análise prévia, Tags e
o país clicado no Mapa-múndi) são **ignorados aqui, com aviso na tela**: eles
encolhem o conjunto de pedidos, e um país com projeto de outra categoria viraria
"sem pedido" — o país clicado deixaria o mundo inteiro laranja. Por isso a
página lê `ciclos` (a remessa inteira) e não `projetos` do contexto.

## Marcar candidato (a escrita)

A ★ na tabela grava/desfaz em **`data/parcerias_candidatos.csv`** — fora da
origem, mesmo padrão do link do Drive (Fase 9). Colunas: `chave`
(`AGÊNCIA:nome`), `rotulo`, `nota`, `marcado_em`. A nota é escrita **no Excel**;
o painel só marca/desmarca. Aparece como ★ N no ranking e no KPI.

## Dados (tudo em `data/`, nada na origem)

| Arquivo                       | O que é                                                                              | Sujeira tratada                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `db-apmt.csv` (sem cabeçalho) | nome, cônjuge, país, **recebido em 2026** (0 = não foi parceiro)                     | "Brasil Indígena/Hispânico/…" → BRA + público; "Porugal"; 2 sem país                                                                                                                                                                                                                                                                                   |
| `db-jmm.csv`                  | nome, país                                                                           | 13 valores "Área NN – região" → sensível (conta, não pinta); 6 sem país                                                                                                                                                                                                                                                                                |
| `db-jmn-ipb.csv`              | nome, tipo, município, UF                                                            | 5 sem UF; 20 municípios que são bairro/distrito (não casam; ficam na tabela como "não casado")                                                                                                                                                                                                                                                         |
| `db-jmn-cbb.csv` (`;`)        | Missões Nacionais da CBB (09/2026): nome, função, projeto, cidade, UF                | veio em CP850, convertido para UTF-8 e sem as 624 linhas vazias do fim; 1ª linha é título (`from_line: 2`); **só função "Miss…" vira missionário** (1.051 de 1.147 — professor, cuidador, zelador etc. ficam fora); projeto ("Cristolândia") vai como público; cidades com erro de digitação ("Cavalvante", "Presidende Figueredo") ficam "não casado" |
| `db-jmm-paises.csv`           | países onde a JMM atua, **sem nomes** (86)                                           | vira `Presenca`: pinta e conta em "países com agência", **0 missionários** (não se inventa gente); "Curdistão"/"Oriente Médio" são região → ficam fora; 7 países novos no de-para (Armênia, Brunei, Chade, Gâmbia, Quirguistão, Sudão, Sudão do Sul)                                                                                                   |
| `db-pioneiros.csv` (`;`)      | sobrenome, nome, adulto/filho, país ("Serving in")                                   | veio em CP850, convertido para UTF-8; **só as linhas `Adult` viram missionário** (as outras são filhos); nomes em CAIXA ALTA → capitalizados; país em inglês → aliases no de-para; "MALACCA" → Malásia, "MAINLAND" → China, "MAROCCO" → Marrocos; 3 sem país                                                                                           |
| `ranking-dd.csv`              | 5.886 cidades por demanda (RNK 1 = mais compra)                                      | veio em CP850, convertido para UTF-8; nomes em caixa alta sem acento casam por chave normalizada + UF; **top 100 casa 100%**                                                                                                                                                                                                                           |
| `municipios-br.csv`           | 5.570 centróides (código IBGE, nome, UF, lat, lon)                                   | gerado por `npm run municipios:regen` da malha IBGE; a malha vem com anéis invertidos → antípoda corrigido                                                                                                                                                                                                                                             |
| `brasil-uf.json`              | GeoJSON oficial IBGE das 27 UFs (98 kB)                                              | anéis invertidos → `geometriaBrasil()` reverte antes de projetar                                                                                                                                                                                                                                                                                       |
| `country_map.csv`             | +59 países/aliases que só as agências citam (inclui os nomes em inglês da Pioneiros) | —                                                                                                                                                                                                                                                                                                                                                      |
| `parcerias_candidatos.csv`    | o que o diretor marcou                                                               | —                                                                                                                                                                                                                                                                                                                                                      |

`npm run check` (seção 4c) lista país sem de-para e município sem casar.

## Código

- `src/lib/parcerias.ts` — **puro**: tabelas de UF, chave de município,
  `montarMundo`, `montarBrasil`. Coberto por `npm test`.
- `src/lib/parcerias-dados.ts` — leitura dos CSVs, `alternarCandidato`.
  `dados.parcerias()` na fachada com cache.
- `src/lib/mapa.ts` — `geometriaBrasil()` (Mercator, `fitSize`, projeta pontos).
- `app/(painel)/parcerias/` — `page.tsx` projeta no servidor e manda só os
  municípios citados; `parcerias.tsx` reagrega no cliente e traz o `Zoom`
  (viewBox na mão, ~50 linhas, sem d3-zoom).
- `app/actions.ts` — `marcarCandidato`.

## Achados nos dados (para a equipe)

- **APMT com valor recebido em 2026 em país "sem pedido"** (ex.: Espanha,
  R$ 12.000): o projeto que recebeu entrou na origem com outro país (em geral
  "Brasil", pela sede da agência). O painel mostra o valor na tabela e não
  reclassifica — o país do projeto é o da origem.
- 19 projetos de 2026 com `country = Brasil` e `estado` vazio ou cidade
  estrangeira ("Tirana - Albânia"): não pintam UF nenhuma; o KPI avisa.
- 11 missionários sem país informado pela agência (2 APMT, 6 JMM, 3 Pioneiros): entram na
  contagem total, em lugar nenhum do mapa.
