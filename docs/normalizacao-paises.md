# Normalização de país

A grandeza que importa é o **país**. Cidade/estado são descartados como dimensão.
Cada projeto → **ISO-3166 alpha-3 + continente**, via o de-para
[`data/country_map.csv`](../data/country_map.csv).

> A normalização é **externa** — o banco de origem é somente leitura. O join acontece no
> app/API (ver [`enriquecimento-dados.md`](enriquecimento-dados.md)), **nunca** criando
> tabela ou view na origem.

`cycle_projects.country` vem em português e limpo (~60 valores distintos). O único caso
especial é **`'Outro'`** (17 registros = projetos de **área sensível** que ocultam o país).

## Estratégia

1. `data/country_map.csv` (`raw_country, iso3, name_pt, continent`) — de-para mantido pela
   equipe. `raw_country` = `lower(trim(country))`.
2. No app, casa `country` com o CSV; quando `'Outro'`/vazio, tenta o país real em
   `state`/`city`; sem sucesso → grupo **"Multi-país / sensível"** (não pinta o mapa).
3. Continentes = filtro da página do mapa: **África, Ásia, Europa, América do Sul,
   América do Norte, Oceania, Sensível**.

## De-para completo (nome no banco → ISO-3 → continente → nº projetos 2025+2026)

| País (banco)        | ISO-3 | Continente            | Proj. |
| ------------------- | ----- | --------------------- | ----- |
| Brasil              | BRA   | América do Sul        | 356   |
| Angola              | AGO   | África                | 14    |
| Moçambique          | MOZ   | África                | 13    |
| Guiné-Bissau        | GNB   | África                | 9     |
| China               | CHN   | Ásia                  | 5     |
| Bolívia             | BOL   | América do Sul        | 5     |
| Iraque              | IRQ   | Ásia                  | 4     |
| Senegal             | SEN   | África                | 4     |
| Camboja             | KHM   | Ásia                  | 4     |
| Filipinas           | PHL   | Ásia                  | 4     |
| Cabo Verde          | CPV   | África                | 4     |
| Portugal            | PRT   | Europa                | 4     |
| Itália              | ITA   | Europa                | 4     |
| Vietnã              | VNM   | Ásia                  | 3     |
| Líbano              | LBN   | Ásia                  | 3     |
| Panamá              | PAN   | América do Norte      | 3     |
| Uruguai             | URY   | América do Sul        | 3     |
| Argentina           | ARG   | América do Sul        | 3     |
| São Tomé e Príncipe | STP   | África                | 3     |
| Venezuela           | VEN   | América do Sul        | 3     |
| Reino Unido         | GBR   | Europa                | 3     |
| Chile               | CHL   | América do Sul        | 3     |
| Peru                | PER   | América do Sul        | 3     |
| Malásia             | MYS   | Ásia                  | 3     |
| Timor-Leste         | TLS   | Ásia                  | 2     |
| Austrália           | AUS   | Oceania               | 2     |
| Israel              | ISR   | Ásia                  | 2     |
| Colômbia            | COL   | América do Sul        | 2     |
| Romênia             | ROU   | Europa                | 2     |
| Nova Zelândia       | NZL   | Oceania               | 2     |
| Egito               | EGY   | África                | 2     |
| Marrocos            | MAR   | África                | 2     |
| Tanzânia            | TZA   | África                | 2     |
| Gana                | GHA   | África                | 2     |
| França              | FRA   | Europa                | 2     |
| África do Sul       | ZAF   | África                | 2     |
| Níger               | NER   | África                | 1     |
| Nigéria             | NGA   | África                | 1     |
| Índia               | IND   | Ásia                  | 1     |
| Ruanda              | RWA   | África                | 1     |
| Bangladesh          | BGD   | Ásia                  | 1     |
| Cuba                | CUB   | América do Norte      | 1     |
| Paquistão           | PAK   | Ásia                  | 1     |
| Burkina Faso        | BFA   | África                | 1     |
| Grécia              | GRC   | Europa                | 1     |
| Jordânia            | JOR   | Ásia                  | 1     |
| Madagascar          | MDG   | África                | 1     |
| Albânia             | ALB   | Europa                | 1     |
| Mianmar             | MMR   | Ásia                  | 1     |
| Indonésia           | IDN   | Ásia                  | 1     |
| Síria               | SYR   | Ásia                  | 1     |
| Zimbabué            | ZWE   | África                | 1     |
| Estados Unidos      | USA   | América do Norte      | 1     |
| Geórgia             | GEO   | Ásia                  | 1     |
| Mongólia            | MNG   | Ásia                  | 1     |
| Áustria             | AUT   | Europa                | 1     |
| Espanha             | ESP   | Europa                | 1     |
| México              | MEX   | América do Norte      | 1     |
| Coreia do Norte     | PRK   | Ásia                  | 1     |
| **Outro / vazio**   | —     | Multi-país / sensível | 17    |

### Países recuperáveis de dentro de "Outro" (via state/city)

Tadjiquistão (TJK, Ásia), Iêmen (YEM, Ásia), Madagascar (MDG), Níger (NER),
Bangladesh (BGD), Zimbábue (ZWE), Camboja (KHM). Os demais "Outro" citam regiões
multi-país ("Ásia, Oriente Médio, África…") → permanecem em "Multi-país / sensível".

> Nota: o `name_pt` do banco usa grafias como "Zimbabué", "Vietnã", "Coreia do Norte".
> Ao casar com TopoJSON mundial (que usa nomes/códigos em inglês), **casar por ISO-3**,
> não por nome.
