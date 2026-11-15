-- GoTransfer · Painéis de gestão
-- 1) Parâmetros da plataforma (configurações globais, editáveis pelo Admin).
-- 2) Categorias de veículo editáveis pela equipe GoTransfer.
-- 3) Consulta de usuários com último acesso, só para a equipe GoTransfer.
-- Depende das migrações anteriores. Tudo acontece em uma transação.

begin;

-- ---------------------------------------------------------------------------
-- 1) Parâmetros da plataforma
-- ---------------------------------------------------------------------------
create table public.platform_settings (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{2,60}$'),
  value jsonb not null,
  updated_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now()
);

insert into public.platform_settings (key, value) values
  ('wait_tolerance_airport_min', '60'),
  ('wait_tolerance_bus_station_min', '30'),
  ('min_booking_lead_hours', '2'),
  ('offer_accept_window_sec', '90'),
  ('document_expiry_warning_days', '30'),
  ('default_timezone', '"America/Sao_Paulo"'),
  ('require_mfa_for_admins', 'false'),
  ('session_max_hours', '12'),
  ('audit_personal_data_exports', 'true');

create trigger platform_settings_touch before update on public.platform_settings
  for each row execute function private.touch_updated_at();

-- Auditoria própria (a tabela não tem id uuid nem organização).
create function private.audit_setting()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_logs (actor_id, organization_id, action, entity, entity_id, old_data, new_data)
  values ((select auth.uid()), null, lower(tg_op), 'platform_settings', null,
          case when tg_op = 'INSERT' then null else to_jsonb(old) end,
          case when tg_op = 'DELETE' then null else to_jsonb(new) end);
  return coalesce(new, old);
end;
$$;

create trigger platform_settings_audit after insert or update or delete on public.platform_settings
  for each row execute function private.audit_setting();

alter table public.platform_settings enable row level security;
revoke all on public.platform_settings from anon, authenticated;
grant select on public.platform_settings to authenticated;
grant update (value) on public.platform_settings to authenticated;

create policy platform_settings_select on public.platform_settings for select to authenticated
  using ((select private.is_platform_staff()));

create policy platform_settings_update on public.platform_settings for update to authenticated
  using ((select private.has_platform_role(array['superadmin']::public.member_role[])))
  with check ((select private.has_platform_role(array['superadmin']::public.member_role[])));

-- ---------------------------------------------------------------------------
-- 2) Categorias de veículo editáveis
-- ---------------------------------------------------------------------------
grant insert (slug, name, typical_seats, sort_order, is_active) on public.vehicle_categories to authenticated;
grant update (name, typical_seats, sort_order, is_active) on public.vehicle_categories to authenticated;

create policy vehicle_categories_insert on public.vehicle_categories for insert to authenticated
  with check ((select private.has_platform_role(array['superadmin', 'platform_operator']::public.member_role[])));

create policy vehicle_categories_update on public.vehicle_categories for update to authenticated
  using ((select private.has_platform_role(array['superadmin', 'platform_operator']::public.member_role[])))
  with check ((select private.has_platform_role(array['superadmin', 'platform_operator']::public.member_role[])));

create trigger vehicle_categories_audit after insert or update or delete on public.vehicle_categories
  for each row execute function private.audit_row();

-- ---------------------------------------------------------------------------
-- 3) Usuários com último acesso (lê auth.users; só equipe GoTransfer)
-- ---------------------------------------------------------------------------
create function public.admin_list_users()
returns table (
  user_id uuid,
  full_name text,
  email text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  email_confirmed boolean,
  memberships jsonb
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_platform_staff() then
    raise exception 'NOT_ALLOWED';
  end if;
  return query
    select
      u.id,
      coalesce(p.full_name, ''),
      u.email::text,
      u.created_at,
      u.last_sign_in_at,
      u.email_confirmed_at is not null,
      coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', m.id,
                 'role', m.role,
                 'organization_id', o.id,
                 'organization', o.trade_name,
                 'organization_type', o.type
               ) order by o.trade_name)
        from public.memberships m
        join public.organizations o on o.id = m.organization_id
        where m.user_id = u.id and m.status = 'active'
      ), '[]'::jsonb)
    from auth.users u
    left join public.profiles p on p.id = u.id
    order by u.created_at desc;
end;
$$;

revoke execute on function public.admin_list_users() from public, anon;
grant execute on function public.admin_list_users() to authenticated;

commit;
