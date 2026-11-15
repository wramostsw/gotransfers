-- GoTransfer · Fase 3 · Reservas e tarifas
-- Locais, passageiros, regras de preço (tabela fixa, distância e tempo, cotação manual),
-- reservas com trechos, serviços operacionais e livro-razão financeiro.
-- Regras críticas ficam no banco: preço, confirmação, cancelamento e lançamentos
-- só acontecem pelas funções (RPC) deste arquivo; ninguém grava direto nas tabelas.
-- A agência nunca enxerga quanto o prestador recebe nem a taxa da plataforma.
-- Depende das migrações anteriores. Tudo acontece em uma transação.

begin;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type public.location_kind as enum ('airport', 'bus_station', 'hotel', 'address', 'other');
create type public.service_kind as enum (
  'airport_arrival', 'airport_departure', 'bus_arrival', 'bus_departure', 'point_to_point'
);
create type public.pricing_mode as enum ('fixed', 'distance', 'manual');
-- PRD 13.3
create type public.booking_status as enum (
  'draft', 'awaiting_quote', 'quoted', 'awaiting_payment', 'confirmed',
  'partially_confirmed', 'in_progress', 'completed', 'cancelled', 'disputed'
);
create type public.segment_status as enum ('awaiting_quote', 'quoted', 'confirmed', 'completed', 'cancelled');
-- PRD 13.4
create type public.service_status as enum (
  'created', 'awaiting_dispatch', 'offered', 'accepted', 'awaiting_assignment', 'assigned',
  'driver_en_route', 'driver_arrived', 'boarding', 'in_progress',
  'completed', 'cancelled', 'failed', 'under_review'
);
create type public.ledger_account as enum (
  'agency_receivable',  -- o que a agência deve ao GoTransfer
  'platform_revenue',   -- taxa da plataforma
  'provider_accrual',   -- repasse provisionado, ainda sem prestador definido
  'provider_payable'    -- repasse devido a um prestador (usado a partir da Fase 4)
);
create type public.ledger_entry_type as enum ('charge', 'platform_fee', 'provider_due', 'reversal', 'adjustment');
create type public.ledger_direction as enum ('debit', 'credit');

-- A auditoria passa a aceitar o nome da coluna da empresa como argumento do gatilho
-- (reservas usam agency_id). Sem argumento, continua lendo organization_id.
create or replace function private.audit_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_row jsonb := to_jsonb(coalesce(new, old));
  v_org_key text := case when tg_nargs > 0 then tg_argv[0] else 'organization_id' end;
begin
  insert into public.audit_logs (actor_id, organization_id, action, entity, entity_id, old_data, new_data)
  values (
    (select auth.uid()),
    case tg_table_name when 'organizations' then (v_row ->> 'id')::uuid else (v_row ->> v_org_key)::uuid end,
    lower(tg_op),
    tg_table_name,
    (v_row ->> 'id')::uuid,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

insert into public.platform_settings (key, value) values ('quote_validity_hours', '24')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Locais (aeroportos, rodoviárias, hotéis, endereços)
-- organization_id nulo = local da plataforma, visível a todos.
-- ---------------------------------------------------------------------------
create table public.locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete restrict,
  kind public.location_kind not null,
  name text not null check (char_length(trim(name)) between 2 and 160),
  code text check (code is null or char_length(code) between 2 and 8),
  address_line text check (address_line is null or char_length(address_line) <= 240),
  city text not null check (char_length(trim(city)) between 2 and 120),
  state text not null check (state ~ '^[A-Z]{2}$'),
  latitude numeric(9, 6) check (latitude is null or latitude between -90 and 90),
  longitude numeric(9, 6) check (longitude is null or longitude between -180 and 180),
  is_active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index locations_org_idx on public.locations (organization_id);
create index locations_city_idx on public.locations (lower(city));

-- ---------------------------------------------------------------------------
-- Passageiros (pertencem à agência; só o mínimo necessário para o transfer)
-- ---------------------------------------------------------------------------
create table public.passengers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  full_name text not null check (char_length(trim(full_name)) between 3 and 200),
  phone text check (phone is null or char_length(phone) <= 32),
  email text check (email is null or char_length(email) <= 200),
  notes text check (notes is null or char_length(notes) <= 500),
  is_active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index passengers_org_idx on public.passengers (organization_id);

-- ---------------------------------------------------------------------------
-- Regras de preço (só a equipe GoTransfer enxerga e edita)
-- sale_price_cents = quanto a AGÊNCIA paga ao GoTransfer pelo trecho.
-- take_bps = fatia da plataforma em pontos-base (2400 = 24%).
-- ---------------------------------------------------------------------------
create table public.pricing_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 160),
  mode public.pricing_mode not null check (mode <> 'manual'),
  -- Filtros opcionais: vazio = vale para qualquer um.
  agency_id uuid references public.organizations (id) on delete restrict, -- preço contratado
  service_kind public.service_kind,
  category_id uuid references public.vehicle_categories (id) on delete restrict,
  origin_location_id uuid references public.locations (id) on delete restrict,
  destination_location_id uuid references public.locations (id) on delete restrict,
  origin_city text check (origin_city is null or char_length(origin_city) between 2 and 120),
  destination_city text check (destination_city is null or char_length(destination_city) between 2 and 120),
  is_bidirectional boolean not null default true,
  -- Tabela fixa
  sale_price_cents integer check (sale_price_cents is null or sale_price_cents > 0),
  -- Distância e tempo
  base_cents integer not null default 0 check (base_cents >= 0),
  per_km_cents integer not null default 0 check (per_km_cents >= 0),
  per_min_cents integer not null default 0 check (per_min_cents >= 0),
  min_price_cents integer not null default 0 check (min_price_cents >= 0),
  take_bps integer not null check (take_bps between 0 and 10000),
  valid_from date not null default current_date,
  valid_until date,
  priority integer not null default 0,
  is_active boolean not null default true,
  version integer not null default 1,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_until is null or valid_until >= valid_from),
  check (mode <> 'fixed' or sale_price_cents is not null),
  check (mode <> 'distance' or (base_cents + per_km_cents + per_min_cents) > 0)
);
create index pricing_rules_active_idx on public.pricing_rules (is_active, valid_from);

-- ---------------------------------------------------------------------------
-- Reservas e trechos
-- ---------------------------------------------------------------------------
create sequence private.booking_code_seq;

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  agency_id uuid not null references public.organizations (id) on delete restrict,
  passenger_id uuid not null references public.passengers (id) on delete restrict,
  status public.booking_status not null,
  currency text not null default 'BRL' check (currency = 'BRL'),
  -- Soma do que a agência paga pelos trechos com preço e não cancelados.
  total_cents integer not null default 0 check (total_cents >= 0),
  external_ref text check (external_ref is null or char_length(external_ref) <= 80),
  notes text check (notes is null or char_length(notes) <= 1000),
  created_by uuid references auth.users (id) on delete set null,
  confirmed_by uuid references auth.users (id) on delete set null,
  confirmed_at timestamptz,
  cancelled_by uuid references auth.users (id) on delete set null,
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index bookings_agency_idx on public.bookings (agency_id, created_at desc);
create index bookings_status_idx on public.bookings (status);
create index bookings_passenger_idx on public.bookings (passenger_id);

create table public.booking_segments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete restrict,
  agency_id uuid not null references public.organizations (id) on delete restrict,
  position smallint not null check (position between 1 and 20),
  service_kind public.service_kind not null,
  origin_location_id uuid not null references public.locations (id) on delete restrict,
  destination_location_id uuid not null references public.locations (id) on delete restrict,
  -- Cópia do local no momento da reserva: editar o cadastro não muda a reserva.
  origin_snapshot jsonb not null,
  destination_snapshot jsonb not null,
  pickup_at timestamptz not null,
  trip_reference text check (trip_reference is null or char_length(trip_reference) <= 40), -- voo ou linha
  pax_count smallint not null check (pax_count between 1 and 80),
  luggage_large smallint not null default 0 check (luggage_large between 0 and 200),
  luggage_medium smallint not null default 0 check (luggage_medium between 0 and 200),
  category_id uuid not null references public.vehicle_categories (id) on delete restrict,
  needs_accessible boolean not null default false,
  child_seats smallint not null default 0 check (child_seats between 0 and 10),
  notes text check (notes is null or char_length(notes) <= 500),
  -- Informados à mão até existir integração de mapas.
  distance_km numeric(7, 1) check (distance_km is null or distance_km between 0.1 and 5000),
  duration_min integer check (duration_min is null or duration_min between 1 and 3000),
  pricing_mode public.pricing_mode not null,
  sale_price_cents integer check (sale_price_cents is null or sale_price_cents > 0),
  quote_valid_until timestamptz,
  status public.segment_status not null,
  cancelled_by uuid references auth.users (id) on delete set null,
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (booking_id, position),
  check (origin_location_id <> destination_location_id),
  check (status = 'awaiting_quote' or status = 'cancelled' or sale_price_cents is not null)
);
create index booking_segments_agency_idx on public.booking_segments (agency_id, pickup_at);
create index booking_segments_status_idx on public.booking_segments (status, pickup_at);

-- Composição interna do preço do trecho. Só a equipe GoTransfer lê.
create table public.segment_costs (
  id uuid primary key default gen_random_uuid(),
  segment_id uuid not null unique references public.booking_segments (id) on delete restrict,
  pricing_rule_id uuid references public.pricing_rules (id) on delete restrict,
  rule_version integer,
  rule_snapshot jsonb,
  provider_payout_cents integer not null check (provider_payout_cents >= 0),
  platform_fee_cents integer not null check (platform_fee_cents >= 0),
  quoted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Serviços operacionais (um por trecho confirmado) e histórico de estados
-- ---------------------------------------------------------------------------
create table public.services (
  id uuid primary key default gen_random_uuid(),
  segment_id uuid not null references public.booking_segments (id) on delete restrict,
  booking_id uuid not null references public.bookings (id) on delete restrict,
  agency_id uuid not null references public.organizations (id) on delete restrict,
  status public.service_status not null default 'created',
  pickup_at timestamptz not null,
  -- Preenchidos pela distribuição (Fase 4).
  provider_org_id uuid references public.organizations (id) on delete restrict,
  driver_id uuid references public.drivers (id) on delete restrict,
  vehicle_id uuid references public.vehicles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Só um serviço vivo por trecho.
create unique index services_one_live_per_segment on public.services (segment_id)
  where status not in ('cancelled', 'failed');
create index services_status_idx on public.services (status, pickup_at);
create index services_agency_idx on public.services (agency_id, pickup_at);
create index services_booking_idx on public.services (booking_id);
create index services_provider_idx on public.services (provider_org_id, pickup_at) where provider_org_id is not null;

create table public.service_events (
  id bigint generated always as identity primary key,
  service_id uuid not null references public.services (id) on delete restrict,
  agency_id uuid not null references public.organizations (id) on delete restrict,
  from_status public.service_status,
  to_status public.service_status not null,
  actor_id uuid,
  origin text not null check (origin in ('agency', 'platform', 'provider', 'driver', 'system')),
  reason text check (reason is null or char_length(reason) <= 500),
  occurred_at timestamptz not null default now()
);
create index service_events_service_idx on public.service_events (service_id, occurred_at);

-- ---------------------------------------------------------------------------
-- Livro-razão: lançamentos imutáveis, em partidas dobradas (PRD 17.3)
-- Cada transação (tx_id) precisa fechar: soma dos débitos = soma dos créditos.
-- Corrige-se com lançamento inverso (reverses_tx), nunca editando.
-- ---------------------------------------------------------------------------
create table public.ledger_entries (
  id bigint generated always as identity primary key,
  tx_id uuid not null,
  entry_type public.ledger_entry_type not null,
  account public.ledger_account not null,
  direction public.ledger_direction not null,
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null default 'BRL' check (currency = 'BRL'),
  organization_id uuid references public.organizations (id) on delete restrict,
  booking_id uuid references public.bookings (id) on delete restrict,
  segment_id uuid references public.booking_segments (id) on delete restrict,
  service_id uuid references public.services (id) on delete restrict,
  reverses_tx uuid,
  description text check (description is null or char_length(description) <= 300),
  created_by uuid,
  created_at timestamptz not null default now()
);
create index ledger_tx_idx on public.ledger_entries (tx_id);
create index ledger_org_idx on public.ledger_entries (organization_id, account, created_at desc);
create index ledger_booking_idx on public.ledger_entries (booking_id);
create index ledger_segment_idx on public.ledger_entries (segment_id);
create index ledger_reverses_idx on public.ledger_entries (reverses_tx) where reverses_tx is not null;

create function private.ledger_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'LEDGER_IMMUTABLE';
end;
$$;
create trigger ledger_no_change before update or delete on public.ledger_entries
  for each row execute function private.ledger_immutable();
create trigger ledger_no_truncate before truncate on public.ledger_entries
  for each statement execute function private.ledger_immutable();

create function private.ledger_check_balance()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_diff bigint;
begin
  select coalesce(sum(case e.direction when 'debit' then e.amount_cents else -e.amount_cents end), 0)
    into v_diff
    from public.ledger_entries e
   where e.tx_id = new.tx_id;
  if v_diff <> 0 then
    raise exception 'LEDGER_UNBALANCED';
  end if;
  return null;
end;
$$;
-- Conferido no fim da transação do banco, depois de todos os lançamentos.
create constraint trigger ledger_balanced after insert on public.ledger_entries
  deferrable initially deferred
  for each row execute function private.ledger_check_balance();

-- ---------------------------------------------------------------------------
-- Gatilhos de manutenção e auditoria
-- ---------------------------------------------------------------------------
create function private.bump_rule_version()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.version := old.version + 1;
  return new;
end;
$$;
create trigger pricing_rules_version before update on public.pricing_rules
  for each row execute function private.bump_rule_version();

create trigger locations_touch before update on public.locations
  for each row execute function private.touch_updated_at();
create trigger passengers_touch before update on public.passengers
  for each row execute function private.touch_updated_at();
create trigger pricing_rules_touch before update on public.pricing_rules
  for each row execute function private.touch_updated_at();
create trigger bookings_touch before update on public.bookings
  for each row execute function private.touch_updated_at();
create trigger booking_segments_touch before update on public.booking_segments
  for each row execute function private.touch_updated_at();
create trigger segment_costs_touch before update on public.segment_costs
  for each row execute function private.touch_updated_at();
create trigger services_touch before update on public.services
  for each row execute function private.touch_updated_at();

create trigger locations_audit after insert or update or delete on public.locations
  for each row execute function private.audit_row();
create trigger passengers_audit after insert or update or delete on public.passengers
  for each row execute function private.audit_row();
-- Sem coluna de empresa na auditoria: regras e custos ficam visíveis só à plataforma.
create trigger pricing_rules_audit after insert or update or delete on public.pricing_rules
  for each row execute function private.audit_row();
create trigger segment_costs_audit after insert or update or delete on public.segment_costs
  for each row execute function private.audit_row();
create trigger bookings_audit after insert or update or delete on public.bookings
  for each row execute function private.audit_row('agency_id');
create trigger booking_segments_audit after insert or update or delete on public.booking_segments
  for each row execute function private.audit_row('agency_id');
create trigger services_audit after insert or update or delete on public.services
  for each row execute function private.audit_row('agency_id');

-- ---------------------------------------------------------------------------
-- Funções de apoio
-- ---------------------------------------------------------------------------
-- Quem pode criar, confirmar e cancelar reservas de uma agência:
-- administrador ou agente da agência ATIVA, ou a operação GoTransfer.
create function private.can_operate_agency(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.organizations o where o.id = p_org and o.type = 'agency')
     and (
       (
         private.has_org_role(p_org, array['agency_admin', 'agency_agent']::public.member_role[])
         and private.is_org_active(p_org)
       )
       or private.has_platform_role(array['superadmin', 'platform_operator']::public.member_role[])
     );
$$;
grant execute on function private.can_operate_agency(uuid) to authenticated;

create function private.setting_int(p_key text, p_default integer)
returns integer language plpgsql stable security definer set search_path = '' as $$
declare
  v integer;
begin
  select (s.value #>> '{}')::integer into v from public.platform_settings s where s.key = p_key;
  return coalesce(v, p_default);
exception when others then
  return p_default;
end;
$$;

create function private.actor_origin()
returns text language sql stable security definer set search_path = '' as $$
  select case when private.is_platform_staff() then 'platform' else 'agency' end;
$$;

create function private.location_snapshot(p_location uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('kind', l.kind, 'name', l.name, 'code', l.code,
                            'address_line', l.address_line, 'city', l.city, 'state', l.state)
    from public.locations l where l.id = p_location;
$$;

-- Escolhe a regra de preço. Ordem: preço contratado da agência, depois prioridade,
-- depois a regra mais específica, depois tabela fixa, depois a mais recente.
-- Sem regra aplicável, o trecho vai para cotação manual.
-- Arredondamento: sempre para o centavo mais próximo (meio centavo sobe).
create function private.resolve_price(
  p_agency uuid, p_kind public.service_kind, p_origin uuid, p_destination uuid,
  p_category uuid, p_pickup_at timestamptz, p_distance_km numeric, p_duration_min integer
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_day date := (p_pickup_at at time zone 'America/Sao_Paulo')::date;
  v_o_city text;
  v_d_city text;
  v_rule public.pricing_rules%rowtype;
  v_sale integer;
  v_fee integer;
begin
  select lower(l.city) into v_o_city from public.locations l where l.id = p_origin;
  select lower(l.city) into v_d_city from public.locations l where l.id = p_destination;

  select r.* into v_rule
    from public.pricing_rules r
   where r.is_active
     and r.valid_from <= v_day
     and (r.valid_until is null or r.valid_until >= v_day)
     and (r.agency_id is null or r.agency_id = p_agency)
     and (r.service_kind is null or r.service_kind = p_kind)
     and (r.category_id is null or r.category_id = p_category)
     and (r.mode = 'fixed' or (p_distance_km is not null and p_duration_min is not null))
     and (
       (
         (r.origin_location_id is null or r.origin_location_id = p_origin)
         and (r.destination_location_id is null or r.destination_location_id = p_destination)
         and (r.origin_city is null or lower(r.origin_city) = v_o_city)
         and (r.destination_city is null or lower(r.destination_city) = v_d_city)
       )
       or (
         r.is_bidirectional
         and (r.origin_location_id is null or r.origin_location_id = p_destination)
         and (r.destination_location_id is null or r.destination_location_id = p_origin)
         and (r.origin_city is null or lower(r.origin_city) = v_d_city)
         and (r.destination_city is null or lower(r.destination_city) = v_o_city)
       )
     )
   order by (r.agency_id is not null) desc,
            r.priority desc,
            ( (r.origin_location_id is not null)::int + (r.destination_location_id is not null)::int
            + (r.origin_city is not null)::int + (r.destination_city is not null)::int
            + (r.service_kind is not null)::int + (r.category_id is not null)::int ) desc,
            (r.mode = 'fixed') desc,
            r.created_at desc
   limit 1;

  if v_rule.id is null then
    return jsonb_build_object('mode', 'manual');
  end if;

  if v_rule.mode = 'fixed' then
    v_sale := v_rule.sale_price_cents;
  else
    v_sale := greatest(
      v_rule.min_price_cents,
      v_rule.base_cents
        + round(v_rule.per_km_cents * p_distance_km)::integer
        + v_rule.per_min_cents * p_duration_min
    );
  end if;
  if v_sale is null or v_sale <= 0 then
    return jsonb_build_object('mode', 'manual');
  end if;
  v_fee := round(v_sale::numeric * v_rule.take_bps / 10000)::integer;

  return jsonb_build_object(
    'mode', v_rule.mode,
    'sale_price_cents', v_sale,
    'platform_fee_cents', v_fee,
    'provider_payout_cents', v_sale - v_fee,
    'rule_id', v_rule.id,
    'rule_version', v_rule.version,
    'rule_snapshot', to_jsonb(v_rule)
  );
end;
$$;

-- Aplica o preço a um trecho ainda não confirmado.
create function private.price_segment(p_segment uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_seg public.booking_segments%rowtype;
  v_price jsonb;
  v_valid timestamptz := now() + make_interval(hours => private.setting_int('quote_validity_hours', 24));
begin
  select * into v_seg from public.booking_segments s where s.id = p_segment for update;
  if v_seg.id is null or v_seg.status not in ('awaiting_quote', 'quoted') then
    return;
  end if;

  v_price := private.resolve_price(v_seg.agency_id, v_seg.service_kind, v_seg.origin_location_id,
                                   v_seg.destination_location_id, v_seg.category_id, v_seg.pickup_at,
                                   v_seg.distance_km, v_seg.duration_min);

  if v_price ->> 'mode' = 'manual' then
    -- Cotação manual ainda válida é mantida; vencida ou inexistente volta para a fila.
    if v_seg.pricing_mode = 'manual' and v_seg.status = 'quoted'
       and v_seg.quote_valid_until is not null and v_seg.quote_valid_until > now() then
      return;
    end if;
    delete from public.segment_costs c where c.segment_id = p_segment;
    update public.booking_segments
       set pricing_mode = 'manual', sale_price_cents = null, quote_valid_until = null, status = 'awaiting_quote'
     where id = p_segment;
    return;
  end if;

  update public.booking_segments
     set pricing_mode = (v_price ->> 'mode')::public.pricing_mode,
         sale_price_cents = (v_price ->> 'sale_price_cents')::integer,
         quote_valid_until = v_valid,
         status = 'quoted'
   where id = p_segment;

  insert into public.segment_costs (segment_id, pricing_rule_id, rule_version, rule_snapshot,
                                    provider_payout_cents, platform_fee_cents, quoted_by)
  values (p_segment, (v_price ->> 'rule_id')::uuid, (v_price ->> 'rule_version')::integer,
          v_price -> 'rule_snapshot', (v_price ->> 'provider_payout_cents')::integer,
          (v_price ->> 'platform_fee_cents')::integer, (select auth.uid()))
  on conflict (segment_id) do update
    set pricing_rule_id = excluded.pricing_rule_id,
        rule_version = excluded.rule_version,
        rule_snapshot = excluded.rule_snapshot,
        provider_payout_cents = excluded.provider_payout_cents,
        platform_fee_cents = excluded.platform_fee_cents,
        quoted_by = excluded.quoted_by;
end;
$$;

-- Recalcula total e estado da reserva a partir dos trechos.
create function private.refresh_booking(p_booking uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_status public.booking_status;
  v_total integer;
  v_live integer;
  v_waiting integer;
begin
  select b.status into v_status from public.bookings b where b.id = p_booking for update;
  select coalesce(sum(s.sale_price_cents) filter (where s.status <> 'cancelled'), 0),
         count(*) filter (where s.status <> 'cancelled'),
         count(*) filter (where s.status = 'awaiting_quote')
    into v_total, v_live, v_waiting
    from public.booking_segments s where s.booking_id = p_booking;

  if v_live = 0 then
    v_status := 'cancelled';
  elsif v_status in ('draft', 'awaiting_quote', 'quoted') then
    v_status := case when v_waiting > 0 then 'awaiting_quote' else 'quoted' end;
  end if;

  update public.bookings
     set total_cents = v_total,
         status = v_status,
         cancelled_at = case when v_status = 'cancelled' then coalesce(cancelled_at, now()) else cancelled_at end,
         cancelled_by = case when v_status = 'cancelled' then coalesce(cancelled_by, (select auth.uid())) else cancelled_by end
   where id = p_booking;
end;
$$;

create function private.log_service_event(
  p_service uuid, p_agency uuid, p_from public.service_status, p_to public.service_status,
  p_origin text, p_reason text
)
returns void language sql security definer set search_path = '' as $$
  insert into public.service_events (service_id, agency_id, from_status, to_status, actor_id, origin, reason)
  values (p_service, p_agency, p_from, p_to, (select auth.uid()), p_origin, left(p_reason, 500));
$$;

-- Cancela um trecho: encerra o serviço e estorna os lançamentos, sem apagar nada.
create function private.cancel_segment_internal(p_segment uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_seg public.booking_segments%rowtype;
  v_svc public.services%rowtype;
  v_tx uuid;
  v_new_tx uuid;
begin
  select * into v_seg from public.booking_segments s where s.id = p_segment for update;
  if v_seg.id is null or v_seg.status = 'cancelled' then
    return;
  end if;
  if v_seg.status = 'completed' then
    raise exception 'INVALID_STATE';
  end if;

  select * into v_svc from public.services s
   where s.segment_id = p_segment and s.status not in ('cancelled', 'failed')
   for update;
  if v_svc.id is not null then
    if v_svc.status in ('driver_en_route', 'driver_arrived', 'boarding', 'in_progress', 'completed', 'under_review') then
      raise exception 'SERVICE_IN_EXECUTION';
    end if;
    update public.services set status = 'cancelled' where id = v_svc.id;
    perform private.log_service_event(v_svc.id, v_svc.agency_id, v_svc.status, 'cancelled', private.actor_origin(), p_reason);
  end if;

  -- Estorno integral de cada transação ainda não estornada deste trecho.
  for v_tx in
    select distinct e.tx_id from public.ledger_entries e
     where e.segment_id = p_segment and e.reverses_tx is null
       and not exists (select 1 from public.ledger_entries r where r.reverses_tx = e.tx_id)
  loop
    v_new_tx := gen_random_uuid();
    insert into public.ledger_entries (tx_id, entry_type, account, direction, amount_cents, organization_id,
                                       booking_id, segment_id, service_id, reverses_tx, description, created_by)
    select v_new_tx, 'reversal', e.account,
           case e.direction when 'debit' then 'credit' else 'debit' end::public.ledger_direction,
           e.amount_cents, e.organization_id, e.booking_id, e.segment_id, e.service_id, e.tx_id,
           'Estorno por cancelamento', (select auth.uid())
      from public.ledger_entries e where e.tx_id = v_tx;
  end loop;

  update public.booking_segments
     set status = 'cancelled', cancelled_at = now(), cancelled_by = (select auth.uid()), cancel_reason = left(p_reason, 500)
   where id = p_segment;
end;
$$;

-- Funções internas não são chamáveis de fora (só pelas funções públicas abaixo).
revoke execute on function private.setting_int(text, integer) from public;
revoke execute on function private.actor_origin() from public;
revoke execute on function private.location_snapshot(uuid) from public;
revoke execute on function private.resolve_price(uuid, public.service_kind, uuid, uuid, uuid, timestamptz, numeric, integer) from public;
revoke execute on function private.price_segment(uuid) from public;
revoke execute on function private.refresh_booking(uuid) from public;
revoke execute on function private.log_service_event(uuid, uuid, public.service_status, public.service_status, text, text) from public;
revoke execute on function private.cancel_segment_internal(uuid, text) from public;
revoke execute on function private.ledger_immutable() from public;
revoke execute on function private.ledger_check_balance() from public;
revoke execute on function private.bump_rule_version() from public;

-- ---------------------------------------------------------------------------
-- Comandos (RPC)
-- ---------------------------------------------------------------------------
-- Consulta de preço antes de reservar. Devolve só o que a agência paga.
create function public.preview_price(
  p_agency uuid, p_kind public.service_kind, p_origin uuid, p_destination uuid, p_category uuid,
  p_pickup_at timestamptz, p_distance_km numeric default null, p_duration_min integer default null
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_price jsonb;
begin
  if (select auth.uid()) is null
     or not (private.can_operate_agency(p_agency) or (private.is_platform_staff()
             and exists (select 1 from public.organizations o where o.id = p_agency and o.type = 'agency'))) then
    raise exception 'NOT_ALLOWED';
  end if;
  v_price := private.resolve_price(p_agency, p_kind, p_origin, p_destination, p_category,
                                   p_pickup_at, p_distance_km, p_duration_min);
  return jsonb_build_object('mode', v_price ->> 'mode',
                            'sale_price_cents', (v_price ->> 'sale_price_cents')::integer,
                            'currency', 'BRL');
end;
$$;

-- Cria a reserva com um ou mais trechos (ida e volta = dois trechos independentes).
-- p_segments: lista de objetos com service_kind, origin_location_id, destination_location_id,
-- pickup_at, pax_count, category_id e, opcionais, trip_reference, luggage_large, luggage_medium,
-- needs_accessible, child_seats, notes, distance_km, duration_min.
create function public.create_booking(
  p_agency uuid, p_passenger uuid, p_segments jsonb, p_notes text default null, p_external_ref text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_booking uuid;
  v_segment uuid;
  v_item jsonb;
  v_pos integer := 0;
  v_origin uuid;
  v_destination uuid;
  v_category uuid;
  v_pickup timestamptz;
  v_is_staff boolean := private.is_platform_staff();
  v_min_pickup timestamptz := now() + make_interval(hours => private.setting_int('min_booking_lead_hours', 2));
begin
  if (select auth.uid()) is null or not private.can_operate_agency(p_agency) then
    raise exception 'NOT_ALLOWED';
  end if;
  if not exists (select 1 from public.passengers p
                  where p.id = p_passenger and p.organization_id = p_agency and p.is_active) then
    raise exception 'PASSENGER_NOT_FOUND';
  end if;
  if p_segments is null or jsonb_typeof(p_segments) <> 'array'
     or jsonb_array_length(p_segments) not between 1 and 10 then
    raise exception 'INVALID_SEGMENTS';
  end if;

  insert into public.bookings (code, agency_id, passenger_id, status, notes, external_ref, created_by)
  values ('GT-' || lpad(nextval('private.booking_code_seq')::text, 6, '0'), p_agency, p_passenger,
          'awaiting_quote', nullif(trim(coalesce(p_notes, '')), ''),
          nullif(trim(coalesce(p_external_ref, '')), ''), (select auth.uid()))
  returning id into v_booking;

  for v_item in select * from jsonb_array_elements(p_segments) loop
    v_pos := v_pos + 1;
    v_origin := (v_item ->> 'origin_location_id')::uuid;
    v_destination := (v_item ->> 'destination_location_id')::uuid;
    v_category := (v_item ->> 'category_id')::uuid;
    v_pickup := (v_item ->> 'pickup_at')::timestamptz;

    if v_origin is null or v_destination is null or v_origin = v_destination
       or (select count(*) from public.locations l
            where l.id in (v_origin, v_destination) and l.is_active
              and (l.organization_id is null or l.organization_id = p_agency)) <> 2 then
      raise exception 'INVALID_LOCATION';
    end if;
    if not exists (select 1 from public.vehicle_categories c where c.id = v_category and c.is_active) then
      raise exception 'INVALID_CATEGORY';
    end if;
    if v_pickup is null or (v_pickup < v_min_pickup and not v_is_staff) or v_pickup <= now() then
      raise exception 'PICKUP_TOO_SOON';
    end if;

    insert into public.booking_segments (
      booking_id, agency_id, position, service_kind, origin_location_id, destination_location_id,
      origin_snapshot, destination_snapshot, pickup_at, trip_reference, pax_count, luggage_large,
      luggage_medium, category_id, needs_accessible, child_seats, notes, distance_km, duration_min,
      pricing_mode, status
    ) values (
      v_booking, p_agency, v_pos, (v_item ->> 'service_kind')::public.service_kind, v_origin, v_destination,
      private.location_snapshot(v_origin), private.location_snapshot(v_destination), v_pickup,
      nullif(trim(coalesce(v_item ->> 'trip_reference', '')), ''),
      (v_item ->> 'pax_count')::smallint,
      coalesce((v_item ->> 'luggage_large')::smallint, 0),
      coalesce((v_item ->> 'luggage_medium')::smallint, 0),
      v_category,
      coalesce((v_item ->> 'needs_accessible')::boolean, false),
      coalesce((v_item ->> 'child_seats')::smallint, 0),
      nullif(trim(coalesce(v_item ->> 'notes', '')), ''),
      (v_item ->> 'distance_km')::numeric,
      (v_item ->> 'duration_min')::integer,
      'manual', 'awaiting_quote'
    ) returning id into v_segment;

    perform private.price_segment(v_segment);
  end loop;

  perform private.refresh_booking(v_booking);
  return v_booking;
end;
$$;

-- Recalcula os preços de uma reserva ainda não confirmada (por exemplo, cotação vencida).
create function public.refresh_quote(p_booking uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_row public.bookings%rowtype;
  v_segment uuid;
begin
  select * into v_row from public.bookings b where b.id = p_booking for update;
  if v_row.id is null or (select auth.uid()) is null or not private.can_operate_agency(v_row.agency_id) then
    raise exception 'NOT_ALLOWED';
  end if;
  if v_row.status not in ('awaiting_quote', 'quoted') then
    raise exception 'INVALID_STATE';
  end if;
  for v_segment in select s.id from public.booking_segments s
                    where s.booking_id = p_booking and s.status in ('awaiting_quote', 'quoted') loop
    perform private.price_segment(v_segment);
  end loop;
  perform private.refresh_booking(p_booking);
end;
$$;

-- Cotação manual: a equipe GoTransfer informa quanto a agência paga e quanto o prestador recebe.
create function public.set_manual_quote(
  p_segment uuid, p_sale_cents integer, p_payout_cents integer, p_valid_hours integer default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_seg public.booking_segments%rowtype;
  v_status public.booking_status;
  v_hours integer := coalesce(p_valid_hours, private.setting_int('quote_validity_hours', 24));
begin
  if not private.has_platform_role(array['superadmin', 'platform_operator', 'platform_commercial']::public.member_role[]) then
    raise exception 'NOT_ALLOWED';
  end if;
  if p_sale_cents is null or p_sale_cents <= 0 or p_payout_cents is null
     or p_payout_cents < 0 or p_payout_cents > p_sale_cents or v_hours not between 1 and 720 then
    raise exception 'INVALID_QUOTE';
  end if;
  select * into v_seg from public.booking_segments s where s.id = p_segment for update;
  if v_seg.id is null then
    raise exception 'NOT_FOUND';
  end if;
  select b.status into v_status from public.bookings b where b.id = v_seg.booking_id for update;
  if v_seg.status not in ('awaiting_quote', 'quoted') or v_status not in ('awaiting_quote', 'quoted') then
    raise exception 'INVALID_STATE';
  end if;

  update public.booking_segments
     set pricing_mode = 'manual', sale_price_cents = p_sale_cents,
         quote_valid_until = now() + make_interval(hours => v_hours), status = 'quoted'
   where id = p_segment;

  insert into public.segment_costs (segment_id, pricing_rule_id, rule_version, rule_snapshot,
                                    provider_payout_cents, platform_fee_cents, quoted_by)
  values (p_segment, null, null, null, p_payout_cents, p_sale_cents - p_payout_cents, (select auth.uid()))
  on conflict (segment_id) do update
    set pricing_rule_id = null, rule_version = null, rule_snapshot = null,
        provider_payout_cents = excluded.provider_payout_cents,
        platform_fee_cents = excluded.platform_fee_cents,
        quoted_by = excluded.quoted_by;

  perform private.refresh_booking(v_seg.booking_id);
end;
$$;

-- Confirma a contratação: congela o preço, cria os serviços e lança no livro-razão.
-- Pagamento faturado: a agência fica devendo; não há cobrança on-line nesta fase.
create function public.confirm_booking(p_booking uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_row public.bookings%rowtype;
  v_seg public.booking_segments%rowtype;
  v_cost public.segment_costs%rowtype;
  v_service uuid;
  v_tx uuid;
begin
  select * into v_row from public.bookings b where b.id = p_booking for update;
  if v_row.id is null or (select auth.uid()) is null or not private.can_operate_agency(v_row.agency_id) then
    raise exception 'NOT_ALLOWED';
  end if;
  if v_row.status <> 'quoted' then
    raise exception 'INVALID_STATE';
  end if;

  for v_seg in select * from public.booking_segments s
                where s.booking_id = p_booking and s.status <> 'cancelled'
                order by s.position for update loop
    if v_seg.status <> 'quoted' or v_seg.sale_price_cents is null then
      raise exception 'INVALID_STATE';
    end if;
    if v_seg.quote_valid_until is null or v_seg.quote_valid_until < now() then
      raise exception 'QUOTE_EXPIRED';
    end if;
    if v_seg.pickup_at <= now() then
      raise exception 'PICKUP_IN_PAST';
    end if;
    select * into v_cost from public.segment_costs c where c.segment_id = v_seg.id;
    if v_cost.id is null
       or v_cost.provider_payout_cents + v_cost.platform_fee_cents <> v_seg.sale_price_cents then
      raise exception 'PRICE_INCONSISTENT';
    end if;

    update public.booking_segments set status = 'confirmed' where id = v_seg.id;

    insert into public.services (segment_id, booking_id, agency_id, status, pickup_at)
    values (v_seg.id, p_booking, v_row.agency_id, 'awaiting_dispatch', v_seg.pickup_at)
    returning id into v_service;
    perform private.log_service_event(v_service, v_row.agency_id, null, 'awaiting_dispatch',
                                      private.actor_origin(), 'Reserva confirmada');

    v_tx := gen_random_uuid();
    insert into public.ledger_entries (tx_id, entry_type, account, direction, amount_cents, organization_id,
                                       booking_id, segment_id, service_id, description, created_by)
    values (v_tx, 'charge', 'agency_receivable', 'debit', v_seg.sale_price_cents, v_row.agency_id,
            p_booking, v_seg.id, v_service, 'Reserva ' || v_row.code || ' · trecho ' || v_seg.position,
            (select auth.uid()));
    if v_cost.platform_fee_cents > 0 then
      insert into public.ledger_entries (tx_id, entry_type, account, direction, amount_cents, organization_id,
                                         booking_id, segment_id, service_id, description, created_by)
      values (v_tx, 'platform_fee', 'platform_revenue', 'credit', v_cost.platform_fee_cents, null,
              p_booking, v_seg.id, v_service, 'Taxa da plataforma', (select auth.uid()));
    end if;
    if v_cost.provider_payout_cents > 0 then
      insert into public.ledger_entries (tx_id, entry_type, account, direction, amount_cents, organization_id,
                                         booking_id, segment_id, service_id, description, created_by)
      values (v_tx, 'provider_due', 'provider_accrual', 'credit', v_cost.provider_payout_cents, null,
              p_booking, v_seg.id, v_service, 'Repasse provisionado', (select auth.uid()));
    end if;
  end loop;

  update public.bookings
     set status = 'confirmed', confirmed_at = now(), confirmed_by = (select auth.uid())
   where id = p_booking;
  perform private.refresh_booking(p_booking);
end;
$$;

-- Cancela um único trecho; os demais continuam válidos (PRD 18.3).
create function public.cancel_segment(p_segment uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_booking uuid;
  v_row public.bookings%rowtype;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  select s.booking_id into v_booking from public.booking_segments s where s.id = p_segment;
  select * into v_row from public.bookings b where b.id = v_booking for update;
  if v_row.id is null or (select auth.uid()) is null or not private.can_operate_agency(v_row.agency_id) then
    raise exception 'NOT_ALLOWED';
  end if;
  if v_reason is null then
    raise exception 'REASON_REQUIRED';
  end if;
  if v_row.status in ('cancelled', 'completed') then
    raise exception 'INVALID_STATE';
  end if;
  perform private.cancel_segment_internal(p_segment, v_reason);
  perform private.refresh_booking(v_booking);
  update public.bookings set cancel_reason = left(v_reason, 500)
   where id = v_booking and status = 'cancelled' and cancel_reason is null;
end;
$$;

-- Cancela a reserva inteira. Nada é apagado; o histórico fica preservado.
create function public.cancel_booking(p_booking uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_row public.bookings%rowtype;
  v_segment uuid;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  select * into v_row from public.bookings b where b.id = p_booking for update;
  if v_row.id is null or (select auth.uid()) is null or not private.can_operate_agency(v_row.agency_id) then
    raise exception 'NOT_ALLOWED';
  end if;
  if v_reason is null then
    raise exception 'REASON_REQUIRED';
  end if;
  if v_row.status in ('cancelled', 'completed') then
    raise exception 'INVALID_STATE';
  end if;
  for v_segment in select s.id from public.booking_segments s
                    where s.booking_id = p_booking and s.status <> 'cancelled' order by s.position loop
    perform private.cancel_segment_internal(v_segment, v_reason);
  end loop;
  update public.bookings
     set status = 'cancelled', cancelled_at = now(), cancelled_by = (select auth.uid()),
         cancel_reason = left(v_reason, 500)
   where id = p_booking;
  perform private.refresh_booking(p_booking);
end;
$$;

revoke execute on function public.preview_price(uuid, public.service_kind, uuid, uuid, uuid, timestamptz, numeric, integer) from public, anon;
revoke execute on function public.create_booking(uuid, uuid, jsonb, text, text) from public, anon;
revoke execute on function public.refresh_quote(uuid) from public, anon;
revoke execute on function public.set_manual_quote(uuid, integer, integer, integer) from public, anon;
revoke execute on function public.confirm_booking(uuid) from public, anon;
revoke execute on function public.cancel_segment(uuid, text) from public, anon;
revoke execute on function public.cancel_booking(uuid, text) from public, anon;
grant execute on function public.preview_price(uuid, public.service_kind, uuid, uuid, uuid, timestamptz, numeric, integer) to authenticated;
grant execute on function public.create_booking(uuid, uuid, jsonb, text, text) to authenticated;
grant execute on function public.refresh_quote(uuid) to authenticated;
grant execute on function public.set_manual_quote(uuid, integer, integer, integer) to authenticated;
grant execute on function public.confirm_booking(uuid) to authenticated;
grant execute on function public.cancel_segment(uuid, text) to authenticated;
grant execute on function public.cancel_booking(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Segurança por linha (RLS)
-- ---------------------------------------------------------------------------
alter table public.locations enable row level security;
alter table public.passengers enable row level security;
alter table public.pricing_rules enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_segments enable row level security;
alter table public.segment_costs enable row level security;
alter table public.services enable row level security;
alter table public.service_events enable row level security;
alter table public.ledger_entries enable row level security;

revoke all on public.locations, public.passengers, public.pricing_rules, public.bookings,
              public.booking_segments, public.segment_costs, public.services,
              public.service_events, public.ledger_entries from anon, authenticated;

-- Locais: todos leem os da plataforma; cada agência lê e mantém os seus.
grant select on public.locations to authenticated;
grant insert (organization_id, kind, name, code, address_line, city, state, latitude, longitude, is_active)
  on public.locations to authenticated;
grant update (kind, name, code, address_line, city, state, latitude, longitude, is_active)
  on public.locations to authenticated;

create policy locations_select on public.locations for select to authenticated
  using (
    organization_id is null
    or (select private.is_platform_staff())
    or (select private.is_org_member(organization_id))
  );
create policy locations_insert on public.locations for insert to authenticated
  with check (
    (organization_id is null
      and (select private.has_platform_role(array['superadmin', 'platform_operator']::public.member_role[])))
    or (organization_id is not null and (select private.can_operate_agency(organization_id)))
  );
create policy locations_update on public.locations for update to authenticated
  using (
    (organization_id is null
      and (select private.has_platform_role(array['superadmin', 'platform_operator']::public.member_role[])))
    or (organization_id is not null and (select private.can_operate_agency(organization_id)))
  )
  with check (
    (organization_id is null
      and (select private.has_platform_role(array['superadmin', 'platform_operator']::public.member_role[])))
    or (organization_id is not null and (select private.can_operate_agency(organization_id)))
  );

-- Passageiros: a agência dona e a equipe GoTransfer.
grant select on public.passengers to authenticated;
grant insert (organization_id, full_name, phone, email, notes, is_active) on public.passengers to authenticated;
grant update (full_name, phone, email, notes, is_active) on public.passengers to authenticated;

create policy passengers_select on public.passengers for select to authenticated
  using ((select private.is_platform_staff()) or (select private.is_org_member(organization_id)));
create policy passengers_insert on public.passengers for insert to authenticated
  with check ((select private.can_operate_agency(organization_id)));
create policy passengers_update on public.passengers for update to authenticated
  using ((select private.can_operate_agency(organization_id)))
  with check ((select private.can_operate_agency(organization_id)));

-- Regras de preço: só a equipe GoTransfer; edição por superadmin e comercial.
grant select on public.pricing_rules to authenticated;
grant insert (name, mode, agency_id, service_kind, category_id, origin_location_id, destination_location_id,
              origin_city, destination_city, is_bidirectional, sale_price_cents, base_cents, per_km_cents,
              per_min_cents, min_price_cents, take_bps, valid_from, valid_until, priority, is_active)
  on public.pricing_rules to authenticated;
grant update (name, mode, agency_id, service_kind, category_id, origin_location_id, destination_location_id,
              origin_city, destination_city, is_bidirectional, sale_price_cents, base_cents, per_km_cents,
              per_min_cents, min_price_cents, take_bps, valid_from, valid_until, priority, is_active)
  on public.pricing_rules to authenticated;

create policy pricing_rules_select on public.pricing_rules for select to authenticated
  using ((select private.is_platform_staff()));
create policy pricing_rules_insert on public.pricing_rules for insert to authenticated
  with check ((select private.has_platform_role(array['superadmin', 'platform_commercial']::public.member_role[])));
create policy pricing_rules_update on public.pricing_rules for update to authenticated
  using ((select private.has_platform_role(array['superadmin', 'platform_commercial']::public.member_role[])))
  with check ((select private.has_platform_role(array['superadmin', 'platform_commercial']::public.member_role[])));

-- Reservas, trechos, serviços e eventos: somente leitura pela API.
-- O acesso da transportadora e do motorista chega com a distribuição (Fase 4).
grant select on public.bookings, public.booking_segments, public.segment_costs,
                public.services, public.service_events, public.ledger_entries to authenticated;

create policy bookings_select on public.bookings for select to authenticated
  using ((select private.is_platform_staff()) or (select private.is_org_member(agency_id)));
create policy booking_segments_select on public.booking_segments for select to authenticated
  using ((select private.is_platform_staff()) or (select private.is_org_member(agency_id)));
create policy services_select on public.services for select to authenticated
  using ((select private.is_platform_staff()) or (select private.is_org_member(agency_id)));
create policy service_events_select on public.service_events for select to authenticated
  using ((select private.is_platform_staff()) or (select private.is_org_member(agency_id)));

-- Composição do preço (repasse e taxa): só a equipe GoTransfer.
create policy segment_costs_select on public.segment_costs for select to authenticated
  using ((select private.is_platform_staff()));

-- Livro-razão: a plataforma vê tudo; a agência vê só o que ela deve;
-- o prestador vê só o que tem a receber.
create policy ledger_entries_select on public.ledger_entries for select to authenticated
  using (
    (select private.is_platform_staff())
    or (
      organization_id is not null
      and (
        (account = 'agency_receivable'
          and (select private.has_org_role(organization_id, array['agency_admin', 'agency_finance']::public.member_role[])))
        or (account = 'provider_payable'
          and (select private.has_org_role(organization_id, array['carrier_admin']::public.member_role[])))
      )
    )
  );

commit;
