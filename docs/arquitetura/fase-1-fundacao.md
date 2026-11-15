# Fase 1 — Fundação

## O que existe

- **App**: `apps/web`, um único PWA em Next.js 16 (App Router, TypeScript, Tailwind 4). Cada pessoa entra e vê a área do seu perfil: `/admin`, `/agencia`, `/transportadora`, `/motorista`.
- **Banco**: `supabase/migrations/20261114000001_fundacao.sql` (projeto Supabase `jxmbpssmwopkdzrnvihm`).
- **Marca**: cores tiradas do logo, em `apps/web/src/app/globals.css`.

## Modelo de dados

| Tabela | Papel |
|---|---|
| `organizations` | Plataforma, agências e transportadoras. Motorista autônomo é uma transportadora com `is_individual = true`. |
| `profiles` | Nome, e-mail e telefone de cada usuário (criado no cadastro). |
| `memberships` | Vínculo usuário × organização × papel. Uma pessoa pode ter vários. |
| `audit_logs` | Quem fez o quê em organizações e vínculos. Só leitura. |

Papéis: `superadmin`, `platform_operator`, `platform_finance`, `platform_commercial`, `agency_admin`, `agency_agent`, `agency_finance`, `carrier_admin`, `carrier_dispatcher`, `driver`. O banco recusa papel que não combina com o tipo da organização.

## Regras de segurança

- RLS ligada nas quatro tabelas. Agência e transportadora só enxergam a própria organização; a equipe da plataforma enxerga todas.
- Vínculos só mudam pelas funções `add_member_by_email` e `revoke_membership`, que validam quem chama.
- O app usa somente a chave pública. Nenhuma chave secreta entra no código.
- As telas checam a sessão no servidor (`src/lib/auth.ts`); o `proxy.ts` só renova a sessão e redireciona.

## Como colocar para funcionar

1. No Supabase, em SQL Editor, rodar o conteúdo de `supabase/migrations/20261114000001_fundacao.sql`.
2. Preencher `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` em `apps/web/.env.local`.
3. Em Authentication › URL Configuration, incluir `http://localhost:3000/auth/callback` nas Redirect URLs.
4. `npm --prefix apps/web run dev`, criar a conta em `/cadastro`.
5. Rodar `supabase/primeiro_superadmin.sql` com o e-mail da conta.

## Ainda não coberto

- Testes automatizados de RLS (dois tenants, acesso negado).
- Convite por e-mail para quem ainda não tem conta, MFA e recuperação de senha.
- Gestão de equipe pelo próprio administrador da agência ou transportadora (o banco já permite; falta a tela).
- Publicação (Vercel) e ambientes separados de homologação e produção.
