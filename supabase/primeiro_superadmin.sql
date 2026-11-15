-- Torna um usuário já cadastrado o primeiro superadmin da GoTransfer.
-- 1. Cadastre-se no app (tela "Criar conta") com o seu e-mail.
-- 2. Troque SEU_EMAIL_AQUI abaixo e rode este script no SQL Editor do Supabase.
-- Depois disso, novos vínculos são criados pelo próprio app, em Admin › Organizações.

insert into public.memberships (user_id, organization_id, role)
select u.id, o.id, 'superadmin'
from auth.users u
cross join public.organizations o
where lower(u.email) = lower('SEU_EMAIL_AQUI')
  and o.type = 'platform'
on conflict (user_id, organization_id, role) do update set status = 'active', revoked_at = null;
