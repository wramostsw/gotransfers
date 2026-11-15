# Fase 3 — Reservas e tarifas (banco)

Migração: `supabase/migrations/20261115000005_reservas_e_tarifas.sql` (rodar no SQL Editor depois das quatro anteriores).

Esta entrega é só o **banco e as regras**. As telas (tarifas no Admin, reservas no portal da agência, central de serviços) vêm em seguida e usam as funções abaixo.

## Decisões de negócio aplicadas

- Preço **híbrido**: tabela fixa, distância e tempo, ou cotação manual.
- Pagamento **faturado**: a agência fica devendo ao GoTransfer; não há cobrança on-line nesta fase.
- A agência **nunca** vê quanto o prestador recebe nem a taxa da plataforma.
- Ofertas vão para a transportadora ou autônomo (Fase 4); o serviço já nasce pronto para isso.

## Tabelas

| Tabela | Papel | Quem lê |
|---|---|---|
| `locations` | Aeroportos, rodoviárias, hotéis e endereços. Sem empresa = local da plataforma. | Todos leem os da plataforma; cada agência lê e mantém os seus. |
| `passengers` | Passageiros da agência (nome, telefone, e-mail, observação). Sem documento: só o mínimo. | Agência dona e equipe GoTransfer. |
| `pricing_rules` | Regras de preço com versão. | Só equipe GoTransfer. |
| `bookings` | Reserva (contratação comercial), código `GT-000001`. | Agência dona e equipe GoTransfer. |
| `booking_segments` | Trechos da reserva; ida e volta são dois trechos independentes. Guarda cópia dos locais. | Agência dona e equipe GoTransfer. |
| `segment_costs` | Composição interna: repasse ao prestador, taxa da plataforma e a regra usada (com versão e cópia). | Só equipe GoTransfer. |
| `services` | Obrigação operacional, uma por trecho confirmado. | Agência dona e equipe GoTransfer (prestador entra na Fase 4). |
| `service_events` | Histórico de estados do serviço: de, para, autor, origem, motivo. | Idem. |
| `ledger_entries` | Livro-razão em partidas dobradas. | Plataforma vê tudo; admin/financeiro da agência vê só o que ela deve. |

Nenhuma dessas tabelas de reserva, serviço ou financeiro aceita gravação direta pela API. Tudo passa pelas funções.

## Como o preço é escolhido

`sale_price_cents` é quanto a **agência paga ao GoTransfer**. `take_bps` é a fatia da plataforma (2400 = 24%). O que a agência cobra do passageiro é assunto dela e não é guardado.

1. Filtra regras ativas e vigentes na data do embarque que combinem com agência, tipo de serviço, categoria, local ou cidade de origem e destino (regra bidirecional vale nos dois sentidos).
2. Ordem de preferência: preço contratado da agência, maior prioridade, regra mais específica, tabela fixa antes de distância, mais recente.
3. Distância e tempo: `maior(mínimo, base + km × valor/km + minutos × valor/min)`. Quilometragem e minutos são informados à mão até existir integração de mapas.
4. Sem regra aplicável, o trecho fica **aguardando cotação** e a equipe GoTransfer informa venda e repasse.
5. Arredondamento: sempre ao centavo mais próximo. Repasse = venda − taxa.
6. Toda cotação tem validade (`quote_validity_hours`, padrão 24 h). Vencida, não confirma: é preciso recalcular. Reserva confirmada nunca é recalculada.

## Funções (RPC)

| Função | Quem pode | O que faz |
|---|---|---|
| `preview_price` | Agência dona, equipe GoTransfer | Mostra o preço antes de reservar. Devolve só o valor da agência. |
| `create_booking` | Admin ou agente da agência **ativa**; operação GoTransfer | Cria reserva e trechos, valida locais, categoria e antecedência mínima, e já aplica o preço. |
| `refresh_quote` | Idem | Recalcula preços de reserva ainda não confirmada. |
| `set_manual_quote` | Superadmin, operador, comercial | Define venda e repasse de um trecho em cotação manual. |
| `confirm_booking` | Admin ou agente da agência ativa; operação GoTransfer | Congela o preço, cria os serviços em "aguardando distribuição" e lança no livro-razão. |
| `cancel_segment` | Idem | Cancela um trecho; os demais continuam válidos. Motivo obrigatório. |
| `cancel_booking` | Idem | Cancela tudo. Motivo obrigatório. Nada é apagado. |

Erros devolvidos: `NOT_ALLOWED`, `PASSENGER_NOT_FOUND`, `INVALID_SEGMENTS`, `INVALID_LOCATION`, `INVALID_CATEGORY`, `PICKUP_TOO_SOON`, `INVALID_STATE`, `QUOTE_EXPIRED`, `PICKUP_IN_PAST`, `PRICE_INCONSISTENT`, `INVALID_QUOTE`, `REASON_REQUIRED`, `SERVICE_IN_EXECUTION`, `NOT_FOUND`.

## Livro-razão

Na confirmação, cada trecho gera uma transação que fecha em zero:

| Conta | Lado | Exemplo (venda R$ 200, taxa 24%) |
|---|---|---|
| `agency_receivable` (agência deve) | débito | 200,00 |
| `platform_revenue` (taxa) | crédito | 48,00 |
| `provider_accrual` (repasse provisionado) | crédito | 152,00 |

- Lançamento não pode ser editado nem apagado (o banco recusa). Correção é por lançamento inverso.
- Transação desbalanceada é recusada no fim da operação.
- No cancelamento, cada transação do trecho recebe um estorno integral.
- Quando houver prestador definido (Fase 4), o provisionado passa para `provider_payable` daquele prestador.

## Testes

`supabase/tests/fase-3-reservas.test.mjs` sobe um Postgres embutido (PGlite), roda as cinco migrações e executa 55 verificações: isolamento entre agências, transportadora sem acesso, agência sem ver custos nem regras, preço nos três modos, preço contratado, validade da cotação, confirmação, livro-razão balanceado e imutável, cancelamento parcial e total com estorno, agência suspensa bloqueada.

Para rodar: em uma pasta qualquer, `npm i @electric-sql/pglite` e `node fase-3-reservas.test.mjs <pasta das migrações>`.

O teste usa um banco local de mentira para login (`auth.users` e `auth.uid()` simulados). Não substitui conferir no Supabase real depois de rodar a migração.

## Pendências e decisões em aberto

- **Multa de cancelamento**: hoje o estorno é sempre integral. A política por etapa (PRD 18.1) precisa ser definida antes do piloto.
- **Limite de crédito e prazo de pagamento** da agência (PRD 17.6): não implementados.
- **Percentuais** (24% da plataforma) continuam sendo hipótese; são configurados por regra, não fixos no código.
- **Extras** (espera, pedágio, parada adicional — PRD 16.4): ficam para depois da distribuição.
- **Alteração de reserva confirmada** (mudar horário ou local com diferença de preço): não implementada; hoje é cancelar e refazer.
- **Fuso** do dia de vigência da regra está fixo em America/Sao_Paulo.
- Matriz completa de transições de estado do serviço chega com a Fase 4.
