-- GoTransfer · Fase 2 (parte 1) · Frota e motoristas
-- Categorias de veículo, veículos, motoristas e aprovação pela plataforma.
-- Depende de 20261114000001_fundacao.sql. Tudo acontece em uma transação.

begin;

create type public.approval_status as enum ('pending', 'approved', 'rejected');
create type public.vehicle_status as enum ('available', 'unavailable', 'maintenance');
create type public.driver_status as enum ('active', 'inactive');

-- ---------------------------------------------------------------------------
-- Categorias de veículo (lista administrável, não fixa no código)
-- ---------------------------------------------------------------------------
create table public.vehicle_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  typical_seats smallint not null check (typical_seats between 1 and 80),
  sort_order smallint not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.vehicle_categories (slug, name, typical_seats, sort_order) values
  ('hatch', 'Hatch', 4, 10),
  ('sedan', 'Sedã', 4, 20),
  ('sedan-executivo', 'Sedã executivo', 4, 30),
  ('suv', 'SUV', 4, 40),
  ('minivan', 'Minivan', 6, 50),
  ('van', 'Van', 15, 60),
  ('micro-onibus', 'Micro-ônibus', 28, 70),
  ('onibus', 'Ônibus', 46, 80);

-- ---------------------------------------------------------------------------
-- Veículos
-- ---------------------------------------------------------------------------
create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  category_id uuid not null references public.vehicle_categories (id) on delete restrict,
  brand text not null check (char_length(trim(brand)) between 2 and 60),
  model text not null check (char_length(trim(model)) between 1 and 60),
  model_year smallint not null check (model_year between 1980 and 2100),
  plate text not null check (plate = upper(plate) and char_length(plate) between 5 and 10),
  color text check (color is null or char_length(color) <= 40),
  -- Capacidade operacional: passageiros e bagagens, não só assentos.
  seats smallint not null check (seats between 1 and 80),
  luggage_large smallint not null default 0 check (luggage_large between 0 and 200),
  luggage_medium smallint not null default 0 check (luggage_medium between 0 and 200),
  is_accessible boolean not null default false,
  has_child_seat boolean not null default false,
  status public.vehicle_status not null default 'available',
  approval_status public.approval_status not null default 'pending',
  rejection_reason text,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index vehicles_plate_unique on public.vehicles (plate);
create index vehicles_org_idx on public.vehicles (organization_id);
create index vehicles_approval_idx on public.vehicles (approval_status);

-- ---------------------------------------------------------------------------
-- Motoristas
-- ---------------------------------------------------------------------------
create table public.drivers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  -- Conta do app ligada ao motorista (preenchida pela função link_driver_user).
  user_id uuid references auth.users (id) on delete set null,
  full_name text not null check (char_length(trim(full_name)) between 3 and 200),
  phone text check (phone is null or char_length(phone) <= 32),
  email text check (email is null or char_length(email) <= 200),
  license_number text not null check (char_length(license_number) between 5 and 20),
  license_category text not null check (license_category in ('B', 'C', 'D', 'E', 'AB', 'AC', 'AD', 'AE')),
  license_expires_at date not null,
  languages text[] not null default array['pt'],
  status public.driver_status not null default 'active',
  approval_status public.approval_status not null default 'pending',
  rejection_reason text,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index drivers_license_unique on public.drivers (organization_id, license_number);
create unique index drivers_user_unique on public.drivers (organization_id, user_id) where user_id is not null;
create index drivers_org_idx on public.drivers (organization_id);
create index drivers_approval_idx on public.drivers (approval_status);

-- ---------------------------------------------------------------------------
-- Funções e gatilhos
-- ---------------------------------------------------------------------------
create function private.is_carrier_org(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organizations o where o.id = p_org and o.type = 'transport_company'
  );
$$;
grant execute on function private.is_carrier_org(uuid) to authenticated;

-- Mudou um dado crítico depois de aprovado? Volta para análise.
create function private.reset_vehicle_approval()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.plate, new.category_id, new.seats, new.organization_id)
       is distinct from (old.plate, old.category_id, old.seats, old.organization_id)
     and new.approval_status = old.approval_status then
    new.approval_status := 'pending';
    new.rejection_reason := null;
    new.reviewed_by := null;
    new.reviewed_at := null;
  end if;
  return new;
end;
$$;

create function private.reset_driver_approval()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.full_name, new.license_number, new.license_category, new.license_expires_at, new.organization_id)
       is distinct from (old.full_name, old.license_number, old.license_category, old.license_expires_at, old.organization_id)
     and new.approval_status = old.approval_status then
    new.approval_status := 'pending';
    new.rejection_reason := null;
    new.reviewed_by := null;
    new.reviewed_at := null;
  end if;
  return new;
end;
$$;

create trigger vehicles_reset_approval before update on public.vehicles
  for each row execute function private.reset_vehicle_approval();
create trigger drivers_reset_approval before update on public.drivers
  for each row execute function private.reset_driver_approval();

create trigger vehicles_touch before update on public.vehicles
  for each row execute function private.touch_updated_at();
create trigger drivers_touch before update on public.drivers
  for each row execute function private.touch_updated_at();

create trigger vehicles_audit after insert or update or delete on public.vehicles
  for each row execute function private.audit_row();
create trigger drivers_audit after insert or update or delete on public.drivers
  for each row execute function private.audit_row();

-- ---------------------------------------------------------------------------
-- Segurança por linha (RLS)
-- ---------------------------------------------------------------------------
alter table public.vehicle_categories enable row level security;
alter table public.vehicles enable row level security;
alter table public.drivers enable row level security;

revoke all on public.vehicle_categories, public.vehicles, public.drivers from anon;
revoke all on public.vehicle_categories, public.vehicles, public.drivers from authenticated;

grant select on public.vehicle_categories to authenticated;

-- A transportadora edita os dados do cadastro; aprovação e vínculo com a conta
-- só mudam pelas funções review_registration e link_driver_user.
grant select on public.vehicles to authenticated;
grant insert (organization_id, category_id, brand, model, model_year, plate, color, seats,
              luggage_large, luggage_medium, is_accessible, has_child_seat, status)
  on public.vehicles to authenticated;
grant update (category_id, brand, model, model_year, plate, color, seats,
              luggage_large, luggage_medium, is_accessible, has_child_seat, status)
  on public.vehicles to authenticated;

grant select on public.drivers to authenticated;
grant insert (organization_id, full_name, phone, email, license_number, license_category,
              license_expires_at, languages, status)
  on public.drivers to authenticated;
grant update (full_name, phone, email, license_number, license_category,
              license_expires_at, languages, status)
  on public.drivers to authenticated;

create policy vehicle_categories_select on public.vehicle_categories for select to authenticated
  using (true);

create policy vehicles_select on public.vehicles for select to authenticated
  using ((select private.is_platform_staff()) or (select private.is_org_member(organization_id)));

create policy vehicles_insert on public.vehicles for insert to authenticated
  with check (
    (select private.is_carrier_org(organization_id))
    and (
      (select private.has_org_role(organization_id, array['carrier_admin', 'carrier_dispatcher']::public.member_role[]))
      or (select private.has_platform_role(array['superadmin', 'platform_operator']::public.member_role[]))
    )
  );

create policy vehicles_update on public.vehicles for update to authenticated
  using (
    (select private.has_org_role(organization_id, array['carrier_admin', 'carrier_dispatcher']::public.member_role[]))
    or (select private.has_platform_role(array['superadmin', 'platform_operator']::public.member_role[]))
  )
  with check (
    (select private.has_org_role(organization_id, array['carrier_admin', 'carrier_dispatcher']::public.member_role[]))
    or (select private.has_platform_role(array['superadmin', 'platform_operator']::public.member_role[]))
  );

-- Motoristas: gestores da transportadora, a plataforma e o próprio motorista.
create policy drivers_select on public.drivers for select to authenticated
  using (
    (select private.is_platform_staff())
    or (select private.has_org_role(organization_id, array['carrier_admin', 'carrier_dispatcher']::public.member_role[]))
    or user_id = (select auth.uid())
  );

create policy drivers_insert on public.drivers for insert to authenticated
  with check (
    (select private.is_carrier_org(organization_id))
    and (
      (select private.has_org_role(organization_id, array['carrier_admin', 'carrier_dispatcher']::public.member_role[]))
      or (select private.has_platform_role(array['superadmin', 'platform_operator']::public.member_role[]))
    )
  );

create policy drivers_update on public.drivers for update to authenticated
  using (
    (select private.has_org_role(organization_id, array['carrier_admin', 'carrier_dispatcher']::public.member_role[]))
    or (select private.has_platform_role(array['superadmin', 'platform_operator']::public.member_role[]))
  )
  with check (
    (select private.has_org_role(organization_id, array['carrier_admin', 'carrier_dispatcher']::public.member_role[]))
    or (select private.has_platform_role(array['superadmin', 'platform_operator']::public.member_role[]))
  );

-- ---------------------------------------------------------------------------
-- Comandos (RPC)
-- ---------------------------------------------------------------------------
-- Aprovar ou reprovar um cadastro: só a equipe da plataforma.
create function public.review_registration(p_entity text, p_id uuid, p_approved boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_found boolean;
begin
  if not private.has_platform_role(array['superadmin', 'platform_operator']::public.member_role[]) then
    raise exception 'NOT_ALLOWED';
  end if;
  if not p_approved and v_reason is null then
    raise exception 'REASON_REQUIRED';
  end if;

  if p_entity = 'vehicle' then
    update public.vehicles
       set approval_status = case when p_approved then 'approved' else 'rejected' end::public.approval_status,
           rejection_reason = case when p_approved then null else left(v_reason, 500) end,
           reviewed_by = (select auth.uid()),
           reviewed_at = now()
     where id = p_id;
    v_found := found;
  elsif p_entity = 'driver' then
    update public.drivers
       set approval_status = case when p_approved then 'approved' else 'rejected' end::public.approval_status,
           rejection_reason = case when p_approved then null else left(v_reason, 500) end,
           reviewed_by = (select auth.uid()),
           reviewed_at = now()
     where id = p_id;
    v_found := found;
  else
    raise exception 'INVALID_ENTITY';
  end if;

  if not v_found then
    raise exception 'NOT_FOUND';
  end if;
end;
$$;

-- Liga o cadastro do motorista à conta do app (pelo e-mail) e libera o papel de motorista.
create function public.link_driver_user(p_driver uuid)
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
    private.has_org_role(v_driver.organization_id, array['carrier_admin']::public.member_role[])
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

revoke execute on function public.review_registration(text, uuid, boolean, text) from public, anon;
revoke execute on function public.link_driver_user(uuid) from public, anon;
grant execute on function public.review_registration(text, uuid, boolean, text) to authenticated;
grant execute on function public.link_driver_user(uuid) to authenticated;

commit;
