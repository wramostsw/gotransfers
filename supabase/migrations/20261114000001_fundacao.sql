-- GoTransfer · Fase 1 · Fundação
-- Organizações, perfis, vínculos (memberships), permissões por linha (RLS) e auditoria.
-- Rodar uma única vez em um projeto sem estas tabelas. Tudo acontece em uma transação.

begin;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type public.org_type as enum ('platform', 'agency', 'transport_company');
create type public.org_status as enum ('pending', 'active', 'suspended', 'blocked');
create type public.membership_status as enum ('active', 'revoked');
create type public.member_role as enum (
  'superadmin', 'platform_operator', 'platform_finance', 'platform_commercial',
  'agency_admin', 'agency_agent', 'agency_finance',
  'carrier_admin', 'carrier_dispatcher', 'driver'
);

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  type public.org_type not null,
  legal_name text not null check (char_length(trim(legal_name)) between 2 and 200),
  trade_name text not null check (char_length(trim(trade_name)) between 2 and 200),
  tax_id text check (tax_id is null or char_length(tax_id) between 5 and 32),
  -- Motorista autônomo é uma transportadora de um único membro.
  is_individual boolean not null default false,
  status public.org_status not null default 'pending',
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not is_individual or type = 'transport_company')
);
-- Só pode existir uma organização da plataforma.
create unique index organizations_single_platform on public.organizations (type) where type = 'platform';
create unique index organizations_tax_id_unique on public.organizations (type, tax_id) where tax_id is not null;
create index organizations_status_idx on public.organizations (status);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 200),
  email text,
  phone text check (phone is null or char_length(phone) <= 32),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  role public.member_role not null,
  status public.membership_status not null default 'active',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (user_id, organization_id, role)
);
create index memberships_user_idx on public.memberships (user_id) where status = 'active';
create index memberships_org_idx on public.memberships (organization_id);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id uuid,
  organization_id uuid,
  action text not null,
  entity text not null,
  entity_id uuid,
  old_data jsonb,
  new_data jsonb
);
create index audit_logs_org_idx on public.audit_logs (organization_id, occurred_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity, entity_id);

-- ---------------------------------------------------------------------------
-- Funções de apoio (schema privado, fora da API pública)
-- ---------------------------------------------------------------------------
create schema if not exists private;

create function private.is_platform_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.memberships m
    join public.organizations o on o.id = m.organization_id
    where m.user_id = (select auth.uid())
      and m.status = 'active'
      and o.type = 'platform'
  );
$$;

create function private.has_platform_role(p_roles public.member_role[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.memberships m
    join public.organizations o on o.id = m.organization_id
    where m.user_id = (select auth.uid())
      and m.status = 'active'
      and o.type = 'platform'
      and m.role = any (p_roles)
  );
$$;

create function private.is_org_member(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.user_id = (select auth.uid())
      and m.organization_id = p_org
      and m.status = 'active'
  );
$$;

create function private.has_org_role(p_org uuid, p_roles public.member_role[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.user_id = (select auth.uid())
      and m.organization_id = p_org
      and m.status = 'active'
      and m.role = any (p_roles)
  );
$$;

create function private.shares_org_with(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.memberships mine
    join public.memberships theirs on theirs.organization_id = mine.organization_id
    where mine.user_id = (select auth.uid())
      and mine.status = 'active'
      and theirs.user_id = p_user
      and theirs.status = 'active'
  );
$$;

create function private.role_matches_org_type(p_role public.member_role, p_type public.org_type)
returns boolean language sql immutable set search_path = '' as $$
  select case p_type
    when 'platform' then p_role in ('superadmin', 'platform_operator', 'platform_finance', 'platform_commercial')
    when 'agency' then p_role in ('agency_admin', 'agency_agent', 'agency_finance')
    when 'transport_company' then p_role in ('carrier_admin', 'carrier_dispatcher', 'driver')
  end;
$$;

grant usage on schema private to authenticated;
grant execute on all functions in schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Gatilhos
-- ---------------------------------------------------------------------------
create function private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger organizations_touch before update on public.organizations
  for each row execute function private.touch_updated_at();
create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();

-- O papel precisa combinar com o tipo da organização.
create function private.check_membership_role()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_type public.org_type;
begin
  select o.type into v_type from public.organizations o where o.id = new.organization_id;
  if not private.role_matches_org_type(new.role, v_type) then
    raise exception 'ROLE_ORG_MISMATCH';
  end if;
  return new;
end;
$$;

create trigger memberships_check_role before insert or update on public.memberships
  for each row execute function private.check_membership_role();

-- Auditoria de organizações e vínculos.
create function private.audit_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_row jsonb := to_jsonb(coalesce(new, old));
begin
  insert into public.audit_logs (actor_id, organization_id, action, entity, entity_id, old_data, new_data)
  values (
    (select auth.uid()),
    case tg_table_name when 'organizations' then (v_row ->> 'id')::uuid else (v_row ->> 'organization_id')::uuid end,
    lower(tg_op),
    tg_table_name,
    (v_row ->> 'id')::uuid,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

create trigger organizations_audit after insert or update or delete on public.organizations
  for each row execute function private.audit_row();
create trigger memberships_audit after insert or update or delete on public.memberships
  for each row execute function private.audit_row();

-- Cria o perfil quando um usuário se cadastra.
create function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 200), new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- Perfis para usuários que já existiam antes desta migração.
insert into public.profiles (id, full_name, email)
select u.id, left(coalesce(u.raw_user_meta_data ->> 'full_name', ''), 200), u.email
from auth.users u
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Segurança por linha (RLS)
-- ---------------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.audit_logs enable row level security;

revoke all on public.organizations, public.profiles, public.memberships, public.audit_logs from anon;
revoke all on public.organizations, public.profiles, public.memberships, public.audit_logs from authenticated;
grant select on public.organizations to authenticated;
grant insert (type, legal_name, trade_name, tax_id, is_individual, status) on public.organizations to authenticated;
grant update (legal_name, trade_name, tax_id, is_individual, status) on public.organizations to authenticated;
grant select, update (full_name, phone) on public.profiles to authenticated;
grant select on public.memberships to authenticated;
grant select on public.audit_logs to authenticated;

-- Organizações: a equipe da plataforma vê todas; os demais veem só as suas.
create policy organizations_select on public.organizations for select to authenticated
  using ((select private.is_platform_staff()) or (select private.is_org_member(id)));

create policy organizations_insert on public.organizations for insert to authenticated
  with check (
    type <> 'platform'
    and (select private.has_platform_role(array['superadmin', 'platform_operator', 'platform_commercial']::public.member_role[]))
  );

create policy organizations_update on public.organizations for update to authenticated
  using (
    type <> 'platform'
    and (select private.has_platform_role(array['superadmin', 'platform_operator', 'platform_commercial']::public.member_role[]))
  )
  with check (type <> 'platform');

-- Perfis: o próprio usuário, colegas da mesma organização e a equipe da plataforma.
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or (select private.is_platform_staff())
    or (select private.shares_org_with(id))
  );

create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Vínculos: leitura pelo próprio usuário, pelos administradores da organização e pela plataforma.
-- Escrita somente pelas funções add_member_by_email e revoke_membership.
create policy memberships_select on public.memberships for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.is_platform_staff())
    or (select private.has_org_role(organization_id, array['agency_admin', 'carrier_admin']::public.member_role[]))
  );

-- Auditoria: somente leitura; ninguém edita ou apaga pela API.
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (
    (select private.is_platform_staff())
    or (organization_id is not null
        and (select private.has_org_role(organization_id, array['agency_admin', 'carrier_admin']::public.member_role[])))
  );

-- ---------------------------------------------------------------------------
-- Comandos (RPC) para gerir vínculos
-- ---------------------------------------------------------------------------
create function private.can_manage_members(p_org uuid, p_role public.member_role)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  v_type public.org_type;
begin
  select o.type into v_type from public.organizations o where o.id = p_org;
  if v_type is null then
    return false;
  end if;
  if v_type = 'platform' then
    -- Só o superadmin concede ou retira papéis internos da plataforma.
    return private.has_platform_role(array['superadmin']::public.member_role[]);
  end if;
  if private.has_platform_role(array['superadmin', 'platform_operator']::public.member_role[]) then
    return true;
  end if;
  return private.has_org_role(p_org, array['agency_admin', 'carrier_admin']::public.member_role[]);
end;
$$;

create function public.add_member_by_email(p_org uuid, p_email text, p_role public.member_role)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
  v_type public.org_type;
  v_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_ALLOWED';
  end if;
  select o.type into v_type from public.organizations o where o.id = p_org;
  if v_type is null or not private.can_manage_members(p_org, p_role) then
    raise exception 'NOT_ALLOWED';
  end if;
  if not private.role_matches_org_type(p_role, v_type) then
    raise exception 'ROLE_ORG_MISMATCH';
  end if;
  select u.id into v_user from auth.users u where lower(u.email) = lower(trim(p_email));
  if v_user is null then
    raise exception 'USER_NOT_FOUND';
  end if;

  insert into public.memberships (user_id, organization_id, role, status, created_by)
  values (v_user, p_org, p_role, 'active', (select auth.uid()))
  on conflict (user_id, organization_id, role)
    do update set status = 'active', revoked_at = null
  returning id into v_id;
  return v_id;
end;
$$;

create function public.revoke_membership(p_membership uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_row public.memberships%rowtype;
begin
  select * into v_row from public.memberships m where m.id = p_membership;
  if v_row.id is null or (select auth.uid()) is null
     or not private.can_manage_members(v_row.organization_id, v_row.role) then
    raise exception 'NOT_ALLOWED';
  end if;
  if v_row.user_id = (select auth.uid()) then
    raise exception 'CANNOT_REVOKE_SELF';
  end if;
  update public.memberships
     set status = 'revoked', revoked_at = now()
   where id = p_membership;
end;
$$;

revoke execute on function public.add_member_by_email(uuid, text, public.member_role) from public, anon;
revoke execute on function public.revoke_membership(uuid) from public, anon;
grant execute on function public.add_member_by_email(uuid, text, public.member_role) to authenticated;
grant execute on function public.revoke_membership(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Organização da plataforma
-- ---------------------------------------------------------------------------
insert into public.organizations (type, legal_name, trade_name, status, created_by)
values ('platform', 'GoTransfer', 'GoTransfer', 'active', null);

commit;
