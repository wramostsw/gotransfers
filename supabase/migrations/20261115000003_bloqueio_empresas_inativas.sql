-- GoTransfer · Correção de segurança
-- Empresas em análise, suspensas ou bloqueadas podem CONSULTAR os próprios dados,
-- mas não cadastram nem alteram veículos, motoristas ou equipe.
-- A equipe GoTransfer continua podendo agir em qualquer empresa.
-- Depende de 20261114000001 e 20261114000002. Tudo acontece em uma transação.

begin;

create function private.is_org_active(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organizations o where o.id = p_org and o.status = 'active'
  );
$$;
grant execute on function private.is_org_active(uuid) to authenticated;

-- Gestor da transportadora COM a empresa ativa, ou operação GoTransfer.
create function private.can_manage_fleet(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select
    (
      private.has_org_role(p_org, array['carrier_admin', 'carrier_dispatcher']::public.member_role[])
      and private.is_org_active(p_org)
    )
    or private.has_platform_role(array['superadmin', 'platform_operator']::public.member_role[]);
$$;
grant execute on function private.can_manage_fleet(uuid) to authenticated;

-- Veículos
drop policy vehicles_insert on public.vehicles;
drop policy vehicles_update on public.vehicles;

create policy vehicles_insert on public.vehicles for insert to authenticated
  with check ((select private.is_carrier_org(organization_id)) and (select private.can_manage_fleet(organization_id)));

create policy vehicles_update on public.vehicles for update to authenticated
  using ((select private.can_manage_fleet(organization_id)))
  with check ((select private.can_manage_fleet(organization_id)));

-- Motoristas
drop policy drivers_insert on public.drivers;
drop policy drivers_update on public.drivers;

create policy drivers_insert on public.drivers for insert to authenticated
  with check ((select private.is_carrier_org(organization_id)) and (select private.can_manage_fleet(organization_id)));

create policy drivers_update on public.drivers for update to authenticated
  using ((select private.can_manage_fleet(organization_id)))
  with check ((select private.can_manage_fleet(organization_id)));

-- Liberar o app ao motorista: mesma regra.
create or replace function public.link_driver_user(p_driver uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_driver public.drivers%rowtype;
  v_user uuid;
begin
  select * into v_driver from public.drivers d where d.id = p_driver;
  if v_driver.id is null or (select auth.uid()) is null then
    raise exception 'NOT_ALLOWED';
  end if;
  if not (
    (private.has_org_role(v_driver.organization_id, array['carrier_admin']::public.member_role[])
       and private.is_org_active(v_driver.organization_id))
    or private.has_platform_role(array['superadmin', 'platform_operator']::public.member_role[])
  ) then
    raise exception 'NOT_ALLOWED';
  end if;
  if v_driver.email is null or trim(v_driver.email) = '' then
    raise exception 'EMAIL_REQUIRED';
  end if;
  select u.id into v_user from auth.users u where lower(u.email) = lower(trim(v_driver.email));
  if v_user is null then
    raise exception 'USER_NOT_FOUND';
  end if;

  update public.drivers set user_id = v_user where id = p_driver;

  insert into public.memberships (user_id, organization_id, role, status, created_by)
  values (v_user, v_driver.organization_id, 'driver', 'active', (select auth.uid()))
  on conflict (user_id, organization_id, role)
    do update set status = 'active', revoked_at = null;
end;
$$;

-- Equipe: o administrador da empresa só gere acessos com a empresa ativa.
create or replace function private.can_manage_members(p_org uuid, p_role public.member_role)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  v_type public.org_type;
begin
  select o.type into v_type from public.organizations o where o.id = p_org;
  if v_type is null then
    return false;
  end if;
  if v_type = 'platform' then
    return private.has_platform_role(array['superadmin']::public.member_role[]);
  end if;
  if private.has_platform_role(array['superadmin', 'platform_operator']::public.member_role[]) then
    return true;
  end if;
  return private.has_org_role(p_org, array['agency_admin', 'carrier_admin']::public.member_role[])
     and private.is_org_active(p_org);
end;
$$;

commit;
