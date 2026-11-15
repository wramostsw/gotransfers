# Fase 4 — Distribuição, designação e execução (banco)

Migração: `supabase/migrations/20261115000006_distribuicao.sql` (rodar no SQL Editor depois das cinco anteriores).

Esta entrega é o **banco e as regras**. As telas (central de serviços no Admin, ofertas e agenda na transportadora, app do motorista com dados reais) vêm em seguida.

## Decisões aplicadas

- A oferta vai para a **transportadora ou autônomo**; quem aceita designa motorista e veículo.
- Modalidade padrão **simultânea** (primeiro aceite válido vence). Também existem sequencial, direcionada e manual.
- A transportadora e o motorista **não leem** as tabelas de reserva. Recebem só o necessário por funções: nunca o preço da agência; nome e telefone do passageiro só depois do aceite.

## Tabelas novas

| Tabela | Papel | Quem lê |
|---|---|---|
| `service_offers` | Uma linha por prestador ofertado em cada rodada: situação, repasse, prazo. | Plataforma e o prestador ofertado. A agência não. |
| `service_assignments` | Histórico de motorista e veículo do serviço; só uma ativa por vez. | Plataforma e o prestador. |

`services` ganhou `distribution_round`.

## Quem pode receber um serviço

Empresa do tipo transportadora, **ativa**, com pelo menos:
- um veículo aprovado e disponível, da **mesma categoria** pedida, com lugares e malas suficientes, acessível e com cadeirinha quando exigido;
- um motorista aprovado, ativo e com CNH válida no dia do embarque.

A ordem padrão é dos menos carregados no dia. Região atendida, avaliações e pontualidade (pesos do PRD 14.3) ainda não entram, porque esses dados não existem.

## Funções

| Função | Quem | O que faz |
|---|---|---|
| `list_eligible_providers` | Plataforma | Lista quem pode receber o serviço. |
| `dispatch_service` | Superadmin, operador | Abre uma rodada: simultânea, sequencial ou direcionada. Reprocessar encerra a rodada anterior. |
| `stop_dispatch` | Superadmin, operador | Interrompe e devolve à central. |
| `assign_service_manual` | Superadmin, operador | Escolhe prestador, motorista e veículo. Mesmas validações; justificativa obrigatória. |
| `respond_offer` | Gestor da transportadora ativa | Aceita ou recusa. |
| `assign_service` | Gestor da transportadora; operação | Designa ou substitui (com justificativa) motorista e veículo. |
| `release_service` | Gestor da transportadora; operação | Desiste após aceitar; o serviço volta à central. |
| `provider_offers` / `provider_services` | Gestor da transportadora | Ofertas e serviços com os dados permitidos. |
| `driver_services` | Motorista logado | Seus serviços. O valor só aparece para autônomo. |
| `driver_advance_service` | Motorista designado | Avança um passo por vez: a caminho, chegou, embarque, em viagem, concluído. |

Erros: `NOT_ALLOWED`, `NOT_FOUND`, `INVALID_STATE`, `INVALID_DISPATCH`, `NO_ELIGIBLE_PROVIDER`, `OFFER_EXPIRED`, `OFFER_UNAVAILABLE`, `DRIVER_NOT_ELIGIBLE`, `VEHICLE_NOT_ELIGIBLE`, `SCHEDULE_CONFLICT`, `REASON_REQUIRED`, `INVALID_TRANSITION`.

## Garantia de um único vencedor

O aceite trava a linha do serviço antes de decidir, então dois aceites ao mesmo tempo são processados um depois do outro; o segundo encontra o serviço já vinculado e é recusado. Um índice único impede duas ofertas aceitas no mesmo serviço mesmo que houvesse falha de lógica. Repetir o próprio aceite devolve sucesso sem duplicar nada.

## Prazo das ofertas

O aceite sempre confere o prazo na hora, então oferta vencida nunca é aceita. Já a **mudança de situação** (marcar como vencida, chamar o próximo da fila, devolver à central) acontece quando alguém abre a lista de ofertas ou age no serviço. Não há agendador rodando sozinho. Para o piloto, convém ligar um agendador no Supabase (pg_cron) chamando a varredura a cada minuto.

O prazo padrão vem de `offer_accept_window_sec` (hoje 90 segundos). Foi pensado para motorista com o app na mão; para um despachante de transportadora é curto. Recomendo subir em Configurações ou informar o prazo em cada rodada.

## Conflito de agenda

Na designação, motorista e veículo não podem ter outro serviço em andamento ou designado a menos de `min_gap_between_services_min` (padrão 120 minutos) deste embarque. É uma janela fixa; tempo real de deslocamento depende da integração de mapas.

## Livro-razão

- No aceite (ou atribuição manual): débito em `provider_accrual`, crédito em `provider_payable` do prestador.
- Se o prestador libera o serviço ou é trocado: estorno desse lançamento.
- No cancelamento: estorno de tudo que estiver em aberto no trecho. Continua integral; a política de multa segue pendente.

## Testes

`supabase/tests/fase-4-distribuicao.test.mjs`: 65 verificações em Postgres embutido (elegibilidade, simultânea, sequencial com recusa e vencimento, direcionada, manual, designação, conflito de agenda, substituição, liberação, execução passo a passo, cancelamento após designação, empresa suspensa, sigilo de preço e de passageiro, livro-razão sempre balanceado). O teste da Fase 3 continua passando.

Limite do teste: o banco embutido usa uma única conexão, então dois aceites **realmente simultâneos** não foram disparados. A proteção está descrita acima, mas vale um teste de carga no Supabase antes do piloto.

## Pendências

- Agendador para vencer ofertas sozinho.
- Região atendida e pontuação do PRD 14.3.
- Modalidade automática (PRD 14.4 A) e expansão progressiva de rodadas (14.6).
- Bloqueios manuais de agenda (folga, manutenção com data) e disponibilidade on-line do motorista.
- Ocorrências, passageiro ausente e falha operacional (Fase 5).
- Multa quando a agência cancela depois do aceite.
