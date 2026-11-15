# Fase 2 (parte 1) — Frota, motoristas e equipe

Migração: `supabase/migrations/20261114000002_frota_motoristas.sql` (rodar no SQL Editor depois da Fase 1).

## Banco

| Tabela | Papel |
|---|---|
| `vehicle_categories` | Categorias administráveis (hatch, sedã, SUV, minivan, van, micro-ônibus, ônibus). |
| `vehicles` | Veículo da transportadora: placa única, passageiros, malas grandes e médias, acessibilidade, cadeirinha, status operacional e aprovação. |
| `drivers` | Motorista da transportadora: CNH (número, categoria, validade), idiomas, contato, status e aprovação. Ligado à conta do app por `user_id`. |

- Cadastros novos entram **em análise**. Só a plataforma aprova ou reprova (`review_registration`, motivo obrigatório na reprovação).
- Se a transportadora muda placa, categoria, capacidade, CNH ou nome depois de aprovado, o cadastro **volta para análise** automaticamente.
- A transportadora não consegue mudar o status de aprovação: a coluna não tem permissão de escrita pela API.
- `link_driver_user` libera o app ao motorista: acha a conta pelo e-mail do cadastro e cria o vínculo com o papel `driver`.

## Telas

- Transportadora: **Veículos**, **Motoristas** (com alerta de CNH vencida ou a vencer em 30 dias) e **Equipe**.
- Agência: **Equipe**.
- Admin: **Aprovações** (fila de motoristas e veículos em análise).

## Ainda falta nesta fase

- Envio de documentos (CNH, CRLV, seguro) com arquivo, validade e alerta de vencimento.
- Regiões atendidas pela transportadora.
- Edição de veículo e motorista (hoje só cadastro e mudança de status).
