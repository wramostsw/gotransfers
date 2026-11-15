-- GoTransfer · Fase 4 · Distribuição, designação e execução
-- Ofertas para transportadoras e autônomos (simultânea, sequencial, direcionada),
-- atribuição manual pela operação, aceite atômico, designação de motorista e veículo
-- com checagem de capacidade, documentos e conflito de agenda, e os passos de
-- execução feitos pelo motorista.
-- A transportadora e o motorista nunca leem as tabelas de reserva: recebem só o
-- necessário por funções (sem o preço da agência; passageiro só depois do aceite).
-- Depende das migrações anteriores. Tudo acontece em uma transação.

begin;

create type public.distribution_mode as enum ('simultaneous', 'sequential', 'directed', 'manual');
create type public.offer_status as enum ('queued', 'pending', 'accepted', 'declined', 'expired', 'cancelled');

insert into public.platform_settings (key, value) values
  ('offers_per_round', '10'),
  ('min_gap_between_services_min', '120')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Ofertas e atribuições
-- ---------------------------------------------------------------------------
create table public.service_offers (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services (id) on delete restrict,
  provider_org_id uuid not null references public.organizations (id) on delete restrict,
  round integer not null check (round >= 1),
  mode public.distribution_mode not null check (mode <> 'manual'),
  status public.offer_status not null,
  -- Ordem na fila (modalidade sequencial).
  position integer not null default 1,
  -- Quanto o prestador recebe se aceitar (cópia do repasse do trecho).
  payout_cents integer not null check (payout_cents >= 0),
  window_sec integer not null check (window_sec between 15 and 604800),
  expires_at timestamptz,
  responded_by uuid references auth.users (id) on delete set null,
  responded_at timestamptz,
  decline_reason text check (decline_reason is null or char_length(decline_reason) <= 300),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (service_id, provider_org_id, round)
);
-- No máximo um aceite por serviço: é isso que garante um único vencedor.
create unique index service_offers_one_accepted on public.service_offers (service_id) where status = 'accepted';
create index service_offers_provider_idx on public.service_offers (provider_org_id, status, created_at desc);
create index service_offers_service_idx on public.service_offers (service_id, round);

create table public.service_assignments (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services (id) on delete restrict,
  provider_org_id uuid not null references public.organizations (id) on delete restrict,
  driver_id uuid not null references public.drivers (id) on delete restrict,
  vehicle_id uuid not null references public.vehicles (id) on delete restrict,
  is_active boolean not null default true,
  reason text check (reason is null or char_length(reason) <= 300),
  assigned_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);
-- Só uma atribuição ativa por serviço (PRD 13.2).
create unique index service_assignments_one_active on public.service_assignments (service_id) where is_active;
create index service_assignments_driver_idx on public.service_assignments (driver_id) where is_active;

alter table public.services add column distribution_round integer not null default 0;

alter table public.service_offers enable row level security;
alter table public.service_assignments enable row level security;
revoke all on public.service_offers, public.service_assignments from anon, authenticated;
grant select on public.service_offers, public.service_assignments to authenticated;

-- A agência não vê ofertas (elas mostram o repasse). Só a plataforma e o prestador ofertado.
create policy service_offers_select on public.service_offers for select to authenticated
  using (
    (select private.is_platform_staff())
    or (select private.has_org_role(provider_org_id, array['carrier_admin', 'carrier_dispatcher']::public.member_role[]))
  );
create policy service_assignments_select on public.service_assignments for select to authenticated
  using (
    (select private.is_platform_staff())
    or (select private.has_org_role(provider_org_id, array['carrier_admin', 'carrier_dispatcher']::public.member_role[]))
  );

-- ---------------------------------------------------------------------------
-- Funções de apoio
-- ---------------------------------------------------------------------------
create function private.can_dispatch()
returns boolean language sql stable security definer set search_path = '' as $$
  select private.has_platform_role(array['superadmin', 'platform_operator']::public.member_role[]);
$$;

-- Gestor da transportadora com a empresa ativa.
create function private.can_act_for_provider(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.has_org_role(p_org, array['carrier_admin', 'carrier_dispatcher']::public.member_role[])
     and private.is_org_active(p_org);
$$;

-- O veículo atende ao trecho? Categoria igual, lugares, malas e requisitos especiais.
create function private.vehicle_fits(p_vehicle uuid, p_segment uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from public.vehicles v, public.booking_segments s
     where v.id = p_vehicle and s.id = p_segment
       and v.approval_status = 'approved' and v.status = 'available'
       and v.category_id = s.category_id
       and v.seats >= s.pax_count
       and v.luggage_large >= s.luggage_large
       and v.luggage_large + v.luggage_medium >= s.luggage_large + s.luggage_medium
       and (not s.needs_accessible or v.is_accessible)
       and (s.child_seats = 0 or v.has_child_seat)
  );
$$;

-- Motorista aprovado, ativo e com CNH válida no dia do embarque.
create function private.driver_valid(p_driver uuid, p_pickup timestamptz)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.drivers d
     where d.id = p_driver and d.approval_status = 'approved' and d.status = 'active'
       and d.license_expires_at >= (p_pickup at time zone 'America/Sao_Paulo')::date
  );
$$;

-- Prestadores que podem receber o serviço: empresa ativa, com pelo menos um veículo
-- compatível e um motorista válido. Ordenados pelos menos carregados no dia.
-- (Região atendida, avaliações e pontualidade entram quando existirem esses dados.)
create function private.eligible_providers(p_service uuid)
returns table (org_id uuid, trade_name text, is_individual boolean, vehicles integer, drivers integer, day_load integer)
language sql stable security definer set search_path = '' as $$
  select o.id, o.trade_name, o.is_individual,
         (select count(*)::integer from public.vehicles v
           where v.organization_id = o.id and private.vehicle_fits(v.id, svc.segment_id)),
         (select count(*)::integer from public.drivers d
           where d.organization_id = o.id and private.driver_valid(d.id, svc.pickup_at)),
         (select count(*)::integer from public.services x
           where x.provider_org_id = o.id
             and x.status not in ('cancelled', 'failed', 'completed')
             and (x.pickup_at at time zone 'America/Sao_Paulo')::date = (svc.pickup_at at time zone 'America/Sao_Paulo')::date)
    from public.services svc
    join public.organizations o on o.type = 'transport_company' and o.status = 'active'
   where svc.id = p_service
     and exists (select 1 from public.vehicles v
                  where v.organization_id = o.id and private.vehicle_fits(v.id, svc.segment_id))
     and exists (select 1 from public.drivers d
                  where d.organization_id = o.id and private.driver_valid(d.id, svc.pickup_at))
   order by 6, o.created_at;
$$;

create function private.service_payout(p_service uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select coalesce((select c.provider_payout_cents
                     from public.services s join public.segment_costs c on c.segment_id = s.segment_id
                    where s.id = p_service), 0);
$$;

-- Estorna uma transação do livro-razão com um lançamento espelhado.
create function private.reverse_tx(p_tx uuid, p_description text)
returns void language sql security definer set search_path = '' as $$
  insert into public.ledger_entries (tx_id, entry_type, account, direction, amount_cents, organization_id,
                                     booking_id, segment_id, service_id, reverses_tx, description, created_by)
  select r.new_tx, 'reversal', e.account,
         case e.direction when 'debit' then 'credit' else 'debit' end::public.ledger_direction,
         e.amount_cents, e.organization_id, e.booking_id, e.segment_id, e.service_id, e.tx_id,
         p_description, (select auth.uid())
    from public.ledger_entries e, (select gen_random_uuid() as new_tx) r
   where e.tx_id = p_tx;
$$;

-- Muda o estado do serviço e registra o evento.
create function private.set_service_status(p_service uuid, p_to public.service_status, p_origin text, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_from public.service_status;
  v_agency uuid;
begin
  select s.status, s.agency_id into v_from, v_agency from public.services s where s.id = p_service for update;
  if v_from = p_to then
    return;
  end if;
  update public.services set status = p_to where id = p_service;
  perform private.log_service_event(p_service, v_agency, v_from, p_to, p_origin, p_reason);
end;
$$;

-- Vence ofertas fora do prazo, chama o próximo da fila e devolve o serviço à
-- central quando ninguém mais pode aceitar. Chamado antes de qualquer ação.
create function private.sweep_service_offers(p_service uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_status public.service_status;
  v_round integer;
  v_next uuid;
begin
  select s.status, s.distribution_round into v_status, v_round
    from public.services s where s.id = p_service for update;
  if v_status is distinct from 'offered' then
    return;
  end if;

  update public.service_offers
     set status = 'expired', responded_at = now()
   where service_id = p_service and status = 'pending' and expires_at <= now();

  if exists (select 1 from public.service_offers o where o.service_id = p_service and o.status = 'pending') then
    return;
  end if;

  select o.id into v_next from public.service_offers o
   where o.service_id = p_service and o.round = v_round and o.status = 'queued'
   order by o.position limit 1;
  if v_next is not null then
    update public.service_offers
       set status = 'pending', expires_at = now() + make_interval(secs => window_sec)
     where id = v_next;
    return;
  end if;

  perform private.set_service_status(p_service, 'awaiting_dispatch', 'system', 'Nenhum prestador aceitou nesta rodada');
end;
$$;

create function private.sweep_all_offers()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_service uuid;
begin
  for v_service in
    select distinct o.service_id from public.service_offers o
      join public.services s on s.id = o.service_id and s.status = 'offered'
     where o.status = 'pending' and o.expires_at <= now()
  loop
    perform private.sweep_service_offers(v_service);
  end loop;
end;
$$;

-- Motorista ou veículo já comprometido perto deste horário?
create function private.has_schedule_conflict(p_service uuid, p_driver uuid, p_vehicle uuid, p_pickup timestamptz)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.services x
     where x.id <> p_service
       and x.status in ('assigned', 'driver_en_route', 'driver_arrived', 'boarding', 'in_progress')
       and (x.driver_id = p_driver or x.vehicle_id = p_vehicle)
       and abs(extract(epoch from (x.pickup_at - p_pickup))) < private.setting_int('min_gap_between_services_min', 120) * 60
  );
$$;

-- Dados operacionais de um serviço para o prestador ou o motorista.
-- Nunca inclui o preço da agência. Passageiro e observações só com p_full.
create function private.service_brief(p_service uuid, p_full boolean)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
           'service_id', s.id,
           'status', s.status,
           'booking_code', b.code,
           'pickup_at', s.pickup_at,
           'service_kind', g.service_kind,
           'origin', g.origin_snapshot,
           'destination', g.destination_snapshot,
           'pax_count', g.pax_count,
           'luggage_large', g.luggage_large,
           'luggage_medium', g.luggage_medium,
           'category', c.name,
           'needs_accessible', g.needs_accessible,
           'child_seats', g.child_seats,
           'distance_km', g.distance_km,
           'duration_min', g.duration_min,
           'trip_reference', g.trip_reference,
           'provider_org_id', s.provider_org_id,
           'driver', case when d.id is null then null else jsonb_build_object('id', d.id, 'name', d.full_name) end,
           'vehicle', case when v.id is null then null
                      else jsonb_build_object('id', v.id, 'label', v.brand || ' ' || v.model, 'plate', v.plate) end
         )
         || case when p_full then jsonb_build_object(
              'notes', g.notes,
              'passenger', jsonb_build_object('name', p.full_name, 'phone', p.phone)
            ) else '{}'::jsonb end
    from public.services s
    join public.booking_segments g on g.id = s.segment_id
    join public.bookings b on b.id = s.booking_id
    join public.passengers p on p.id = b.passenger_id
    join public.vehicle_categories c on c.id = g.category_id
    left join public.drivers d on d.id = s.driver_id
    left join public.vehicles v on v.id = s.vehicle_id
   where s.id = p_service;
$$;

-- Devolve o serviço à central: encerra ofertas e atribuição e desfaz o repasse ao prestador.
create function private.detach_provider(p_service uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_tx uuid;
begin
  update public.service_offers set status = 'cancelled', responded_at = now()
   where service_id = p_service and status in ('pending', 'queued', 'accepted');
  update public.service_assignments set is_active = false, ended_at = now()
   where service_id = p_service and is_active;
  for v_tx in
    select distinct e.tx_id from public.ledger_entries e
     where e.service_id = p_service and e.account = 'provider_payable' and e.reverses_tx is null
       and not exists (select 1 from public.ledger_entries r where r.reverses_tx = e.tx_id)
  loop
    perform private.reverse_tx(v_tx, 'Prestador desvinculado do serviço');
  end loop;
  update public.services set provider_org_id = null, driver_id = null, vehicle_id = null where id = p_service;
end;
$$;

-- Vincula o prestador vencedor e passa o repasse provisionado para o nome dele.
create function private.attach_provider(p_service uuid, p_org uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_svc public.services%rowtype;
  v_payout integer := private.service_payout(p_service);
  v_tx uuid := gen_random_uuid();
begin
  select * into v_svc from public.services s where s.id = p_service;
  update public.services set provider_org_id = p_org where id = p_service;
  if v_payout > 0 then
    insert into public.ledger_entries (tx_id, entry_type, account, direction, amount_cents, organization_id,
                                       booking_id, segment_id, service_id, description, created_by)
    values
      (v_tx, 'provider_due', 'provider_accrual', 'debit', v_payout, null,
       v_svc.booking_id, v_svc.segment_id, p_service, 'Repasse atribuído ao prestador', (select auth.uid())),
      (v_tx, 'provider_due', 'provider_payable', 'credit', v_payout, p_org,
       v_svc.booking_id, v_svc.segment_id, p_service, 'Repasse devido pelo serviço', (select auth.uid()));
  end if;
end;
$$;

-- Valida e grava motorista e veículo no serviço.
create function private.assign_resources(p_service uuid, p_driver uuid, p_vehicle uuid, p_reason text, p_origin text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_svc public.services%rowtype;
begin
  select * into v_svc from public.services s where s.id = p_service for update;
  if not exists (select 1 from public.drivers d where d.id = p_driver and d.organization_id = v_svc.provider_org_id)
     or not private.driver_valid(p_driver, v_svc.pickup_at) then
    raise exception 'DRIVER_NOT_ELIGIBLE';
  end if;
  if not exists (select 1 from public.vehicles v where v.id = p_vehicle and v.organization_id = v_svc.provider_org_id)
     or not private.vehicle_fits(p_vehicle, v_svc.segment_id) then
    raise exception 'VEHICLE_NOT_ELIGIBLE';
  end if;
  if private.has_schedule_conflict(p_service, p_driver, p_vehicle, v_svc.pickup_at) then
    raise exception 'SCHEDULE_CONFLICT';
  end if;

  update public.service_assignments set is_active = false, ended_at = now()
   where service_id = p_service and is_active;
  insert into public.service_assignments (service_id, provider_org_id, driver_id, vehicle_id, reason, assigned_by)
  values (p_service, v_svc.provider_org_id, p_driver, p_vehicle, left(p_reason, 300), (select auth.uid()));
  update public.services set driver_id = p_driver, vehicle_id = p_vehicle where id = p_service;

  if v_svc.status = 'assigned' then
    perform private.log_service_event(p_service, v_svc.agency_id, 'assigned', 'assigned', p_origin,
                                      coalesce('Substituição: ' || p_reason, 'Substituição de motorista ou veículo'));
  else
    perform private.set_service_status(p_service, 'assigned', p_origin, p_reason);
  end if;
end;
$$;

-- Cancelamento de trecho (substitui a versão da Fase 3): agora também encerra
-- ofertas e atribuição. O estorno continua integral.
create or replace function private.cancel_segment_internal(p_segment uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_seg public.booking_segments%rowtype;
  v_svc public.services%rowtype;
  v_tx uuid;
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
    update public.service_offers set status = 'cancelled', responded_at = now()
     where service_id = v_svc.id and status in ('pending', 'queued');
    update public.service_assignments set is_active = false, ended_at = now()
     where service_id = v_svc.id and is_active;
    update public.services set status = 'cancelled' where id = v_svc.id;
    perform private.log_service_event(v_svc.id, v_svc.agency_id, v_svc.status, 'cancelled', private.actor_origin(), p_reason);
  end if;

  for v_tx in
    select distinct e.tx_id from public.ledger_entries e
     where e.segment_id = p_segment and e.reverses_tx is null
       and not exists (select 1 from public.ledger_entries r where r.reverses_tx = e.tx_id)
  loop
    perform private.reverse_tx(v_tx, 'Estorno por cancelamento');
  end loop;

  update public.booking_segments
     set status = 'cancelled', cancelled_at = now(), cancelled_by = (select auth.uid()), cancel_reason = left(p_reason, 500)
   where id = p_segment;
end;
$$;

revoke execute on function private.can_dispatch() from public;
revoke execute on function private.can_act_for_provider(uuid) from public;
revoke execute on function private.vehicle_fits(uuid, uuid) from public;
revoke execute on function private.driver_valid(uuid, timestamptz) from public;
revoke execute on function private.eligible_providers(uuid) from public;
revoke execute on function private.service_payout(uuid) from public;
revoke execute on function private.reverse_tx(uuid, text) from public;
revoke execute on function private.set_service_status(uuid, public.service_status, text, text) from public;
revoke execute on function private.sweep_service_offers(uuid) from public;
revoke execute on function private.sweep_all_offers() from public;
revoke execute on function private.has_schedule_conflict(uuid, uuid, uuid, timestamptz) from public;
revoke execute on function private.service_brief(uuid, boolean) from public;
revoke execute on function private.detach_provider(uuid) from public;
revoke execute on function private.attach_provider(uuid, uuid) from public;
revoke execute on function private.assign_resources(uuid, uuid, uuid, text, text) from public;

-- ---------------------------------------------------------------------------
-- Comandos da operação GoTransfer
-- ---------------------------------------------------------------------------
-- Quem pode receber este serviço (para a central escolher).
create function public.list_eligible_providers(p_service uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_platform_staff() then
    raise exception 'NOT_ALLOWED';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('org_id', e.org_id, 'name', e.trade_name, 'is_individual', e.is_individual,
                                        'vehicles', e.vehicles, 'drivers', e.drivers, 'day_load', e.day_load))
      from private.eligible_providers(p_service) e
  ), '[]'::jsonb);
end;
$$;

-- Abre uma rodada de ofertas. p_providers vazio = todos os elegíveis (até o limite por rodada).
-- Simultânea: todos recebem juntos, o primeiro aceite vence.
-- Sequencial: um por vez, na ordem informada ou dos menos carregados.
-- Direcionada: exatamente um prestador.
create function public.dispatch_service(
  p_service uuid, p_mode public.distribution_mode, p_providers uuid[] default null, p_window_sec integer default null
)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_svc public.services%rowtype;
  v_window integer := coalesce(p_window_sec, private.setting_int('offer_accept_window_sec', 90));
  v_limit integer := private.setting_int('offers_per_round', 10);
  v_payout integer := private.service_payout(p_service);
  v_round integer;
  v_count integer := 0;
  v_org uuid;
begin
  if not private.can_dispatch() then
    raise exception 'NOT_ALLOWED';
  end if;
  if p_mode = 'manual' or v_window not between 15 and 604800 then
    raise exception 'INVALID_DISPATCH';
  end if;
  select * into v_svc from public.services s where s.id = p_service for update;
  if v_svc.id is null then
    raise exception 'NOT_FOUND';
  end if;
  perform private.sweep_service_offers(p_service);
  select * into v_svc from public.services s where s.id = p_service;
  if v_svc.status not in ('awaiting_dispatch', 'offered') or v_svc.pickup_at <= now() then
    raise exception 'INVALID_STATE';
  end if;
  if p_mode = 'directed' and coalesce(array_length(p_providers, 1), 0) <> 1 then
    raise exception 'INVALID_DISPATCH';
  end if;

  -- Reprocessar: encerra a rodada anterior.
  update public.service_offers set status = 'cancelled', responded_at = now()
   where service_id = p_service and status in ('pending', 'queued');
  v_round := v_svc.distribution_round + 1;

  for v_org in
    select e.org_id
      from private.eligible_providers(p_service) with ordinality as e
     where p_providers is null or cardinality(p_providers) = 0 or e.org_id = any (p_providers)
     order by coalesce(array_position(p_providers, e.org_id), 0), e.ordinality
     limit v_limit
  loop
    v_count := v_count + 1;
    insert into public.service_offers (service_id, provider_org_id, round, mode, status, position,
                                       payout_cents, window_sec, expires_at, created_by)
    values (p_service, v_org, v_round, p_mode,
            case when p_mode = 'sequential' and v_count > 1 then 'queued' else 'pending' end::public.offer_status,
            v_count, v_payout, v_window,
            case when p_mode = 'sequential' and v_count > 1 then null else now() + make_interval(secs => v_window) end,
            (select auth.uid()));
  end loop;

  if v_count = 0 or (p_providers is not null and cardinality(p_providers) > 0 and v_count < cardinality(p_providers)) then
    raise exception 'NO_ELIGIBLE_PROVIDER';
  end if;

  update public.services set distribution_round = v_round where id = p_service;
  perform private.set_service_status(p_service, 'offered', 'platform',
    case p_mode when 'simultaneous' then 'Oferta simultânea' when 'sequential' then 'Oferta sequencial' else 'Oferta direcionada' end
    || ' · rodada ' || v_round);
  return v_count;
end;
$$;

-- Interrompe a distribuição e devolve o serviço à central.
create function public.stop_dispatch(p_service uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_status public.service_status;
begin
  if not private.can_dispatch() then
    raise exception 'NOT_ALLOWED';
  end if;
  select s.status into v_status from public.services s where s.id = p_service for update;
  if v_status is distinct from 'offered' then
    raise exception 'INVALID_STATE';
  end if;
  update public.service_offers set status = 'cancelled', responded_at = now()
   where service_id = p_service and status in ('pending', 'queued');
  perform private.set_service_status(p_service, 'awaiting_dispatch', 'platform', coalesce(nullif(trim(p_reason), ''), 'Distribuição interrompida'));
end;
$$;

-- Atribuição manual: o operador escolhe prestador, motorista e veículo.
-- As mesmas validações valem; a justificativa é obrigatória.
create function public.assign_service_manual(p_service uuid, p_provider uuid, p_driver uuid, p_vehicle uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_svc public.services%rowtype;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if not private.can_dispatch() then
    raise exception 'NOT_ALLOWED';
  end if;
  if v_reason is null then
    raise exception 'REASON_REQUIRED';
  end if;
  select * into v_svc from public.services s where s.id = p_service for update;
  if v_svc.id is null then
    raise exception 'NOT_FOUND';
  end if;
  if v_svc.status not in ('awaiting_dispatch', 'offered', 'awaiting_assignment', 'assigned') or v_svc.pickup_at <= now() then
    raise exception 'INVALID_STATE';
  end if;
  if not exists (select 1 from public.organizations o
                  where o.id = p_provider and o.type = 'transport_company' and o.status = 'active') then
    raise exception 'NO_ELIGIBLE_PROVIDER';
  end if;

  if v_svc.provider_org_id is distinct from p_provider then
    perform private.detach_provider(p_service);
    update public.service_offers set status = 'cancelled', responded_at = now()
     where service_id = p_service and status in ('pending', 'queued');
    perform private.attach_provider(p_service, p_provider);
  end if;
  perform private.assign_resources(p_service, p_driver, p_vehicle, 'Atribuição manual: ' || v_reason, 'platform');
end;
$$;

-- ---------------------------------------------------------------------------
-- Comandos da transportadora
-- ---------------------------------------------------------------------------
-- Aceitar ou recusar uma oferta. O bloqueio da linha do serviço garante que,
-- entre vários aceites ao mesmo tempo, só o primeiro vale. Repetir o próprio
-- aceite não dá erro (idempotente).
create function public.respond_offer(p_offer uuid, p_accept boolean, p_reason text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_offer public.service_offers%rowtype;
  v_svc public.services%rowtype;
begin
  select * into v_offer from public.service_offers o where o.id = p_offer;
  if v_offer.id is null or (select auth.uid()) is null or not private.can_act_for_provider(v_offer.provider_org_id) then
    raise exception 'NOT_ALLOWED';
  end if;

  select * into v_svc from public.services s where s.id = v_offer.service_id for update;
  perform private.sweep_service_offers(v_svc.id);
  select * into v_offer from public.service_offers o where o.id = p_offer;
  select * into v_svc from public.services s where s.id = v_offer.service_id;

  if v_offer.status = 'accepted' and p_accept then
    return 'accepted';
  end if;
  if v_offer.status = 'expired' then
    raise exception 'OFFER_EXPIRED';
  end if;
  if v_offer.status <> 'pending' or v_svc.status <> 'offered' or v_svc.provider_org_id is not null then
    raise exception 'OFFER_UNAVAILABLE';
  end if;

  if not p_accept then
    update public.service_offers
       set status = 'declined', responded_at = now(), responded_by = (select auth.uid()),
           decline_reason = left(nullif(trim(coalesce(p_reason, '')), ''), 300)
     where id = p_offer;
    perform private.sweep_service_offers(v_svc.id);
    return 'declined';
  end if;

  -- Ainda consegue atender? (um veículo pode ter saído de operação desde a oferta)
  if not exists (select 1 from private.eligible_providers(v_svc.id) e where e.org_id = v_offer.provider_org_id) then
    raise exception 'NO_ELIGIBLE_PROVIDER';
  end if;

  update public.service_offers
     set status = 'accepted', responded_at = now(), responded_by = (select auth.uid())
   where id = p_offer;
  update public.service_offers set status = 'cancelled', responded_at = now()
   where service_id = v_svc.id and id <> p_offer and status in ('pending', 'queued');
  perform private.attach_provider(v_svc.id, v_offer.provider_org_id);
  perform private.set_service_status(v_svc.id, 'accepted', 'provider', null);
  perform private.set_service_status(v_svc.id, 'awaiting_assignment', 'system', 'Aguardando motorista e veículo');
  return 'accepted';
end;
$$;

-- Designar (ou substituir, com justificativa) motorista e veículo.
create function public.assign_service(p_service uuid, p_driver uuid, p_vehicle uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_svc public.services%rowtype;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_staff boolean := private.can_dispatch();
begin
  select * into v_svc from public.services s where s.id = p_service for update;
  if v_svc.id is null or v_svc.provider_org_id is null or (select auth.uid()) is null
     or not (v_staff or private.can_act_for_provider(v_svc.provider_org_id)) then
    raise exception 'NOT_ALLOWED';
  end if;
  if v_svc.status not in ('awaiting_assignment', 'assigned') then
    raise exception 'INVALID_STATE';
  end if;
  if v_svc.status = 'assigned' and v_reason is null then
    raise exception 'REASON_REQUIRED';
  end if;
  perform private.assign_resources(p_service, p_driver, p_vehicle, v_reason, case when v_staff then 'platform' else 'provider' end);
end;
$$;

-- O prestador desiste depois de aceitar (ou a operação o retira): o serviço volta à central.
create function public.release_service(p_service uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_svc public.services%rowtype;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_staff boolean := private.can_dispatch();
begin
  select * into v_svc from public.services s where s.id = p_service for update;
  if v_svc.id is null or v_svc.provider_org_id is null or (select auth.uid()) is null
     or not (v_staff or private.can_act_for_provider(v_svc.provider_org_id)) then
    raise exception 'NOT_ALLOWED';
  end if;
  if v_reason is null then
    raise exception 'REASON_REQUIRED';
  end if;
  if v_svc.status not in ('awaiting_assignment', 'assigned') then
    raise exception 'INVALID_STATE';
  end if;
  perform private.detach_provider(p_service);
  perform private.set_service_status(p_service, 'awaiting_dispatch', case when v_staff then 'platform' else 'provider' end,
                                     'Prestador liberou o serviço: ' || v_reason);
end;
$$;

-- Ofertas da transportadora (abertas e as últimas respondidas). Sem dados do passageiro.
create function public.provider_offers(p_org uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null
     or not private.has_org_role(p_org, array['carrier_admin', 'carrier_dispatcher']::public.member_role[]) then
    raise exception 'NOT_ALLOWED';
  end if;
  perform private.sweep_all_offers();
  return coalesce((
    select jsonb_agg(x.item order by x.sort_open desc, x.created_at desc)
      from (
        select o.created_at, (o.status = 'pending') as sort_open,
               jsonb_build_object('offer_id', o.id, 'status', o.status, 'mode', o.mode, 'payout_cents', o.payout_cents,
                                  'expires_at', o.expires_at, 'responded_at', o.responded_at)
               || private.service_brief(o.service_id, false) as item
          from public.service_offers o
         where o.provider_org_id = p_org and o.status <> 'queued'
         order by (o.status = 'pending') desc, o.created_at desc
         limit 60
      ) x
  ), '[]'::jsonb);
end;
$$;

-- Serviços que a transportadora aceitou, com passageiro e repasse.
create function public.provider_services(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null
     or not private.has_org_role(p_org, array['carrier_admin', 'carrier_dispatcher']::public.member_role[]) then
    raise exception 'NOT_ALLOWED';
  end if;
  return coalesce((
    select jsonb_agg(x.item order by x.pickup_at)
      from (
        select s.pickup_at,
               private.service_brief(s.id, true) || jsonb_build_object('payout_cents', private.service_payout(s.id)) as item
          from public.services s
         where s.provider_org_id = p_org
         order by s.pickup_at desc
         limit 200
      ) x
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Comandos do motorista
-- ---------------------------------------------------------------------------
-- Serviços do motorista logado. O valor só aparece para o autônomo.
create function public.driver_services()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_ALLOWED';
  end if;
  return coalesce((
    select jsonb_agg(x.item order by x.pickup_at)
      from (
        select s.pickup_at,
               private.service_brief(s.id, true)
               || jsonb_build_object('payout_cents', case when o.is_individual then private.service_payout(s.id) else null end) as item
          from public.services s
          join public.drivers d on d.id = s.driver_id and d.user_id = (select auth.uid())
          join public.organizations o on o.id = s.provider_org_id
         where s.status in ('assigned', 'driver_en_route', 'driver_arrived', 'boarding', 'in_progress', 'completed')
         order by s.pickup_at desc
         limit 100
      ) x
  ), '[]'::jsonb);
end;
$$;

-- O motorista avança o serviço um passo por vez, sem pular etapas (PRD 13.4).
create function public.driver_advance_service(p_service uuid, p_to public.service_status)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_svc public.services%rowtype;
  v_next public.service_status;
begin
  select * into v_svc from public.services s where s.id = p_service for update;
  if v_svc.id is null or (select auth.uid()) is null
     or not exists (select 1 from public.drivers d where d.id = v_svc.driver_id and d.user_id = (select auth.uid())) then
    raise exception 'NOT_ALLOWED';
  end if;
  if v_svc.status = p_to then
    return; -- toque repetido
  end if;
  v_next := case v_svc.status
    when 'assigned' then 'driver_en_route'
    when 'driver_en_route' then 'driver_arrived'
    when 'driver_arrived' then 'boarding'
    when 'boarding' then 'in_progress'
    when 'in_progress' then 'completed'
  end;
  if v_next is null or v_next <> p_to then
    raise exception 'INVALID_TRANSITION';
  end if;
  perform private.set_service_status(p_service, p_to, 'driver', null);

  if p_to = 'completed' then
    update public.booking_segments set status = 'completed' where id = v_svc.segment_id;
    update public.service_assignments set is_active = false, ended_at = now() where service_id = p_service and is_active;
  end if;
  update public.bookings b
     set status = case
           when not exists (select 1 from public.booking_segments g
                             where g.booking_id = b.id and g.status not in ('completed', 'cancelled'))
             then 'completed'
           else 'in_progress'
         end::public.booking_status
   where b.id = v_svc.booking_id and b.status in ('confirmed', 'partially_confirmed', 'in_progress');
end;
$$;

revoke execute on function public.list_eligible_providers(uuid) from public, anon;
revoke execute on function public.dispatch_service(uuid, public.distribution_mode, uuid[], integer) from public, anon;
revoke execute on function public.stop_dispatch(uuid, text) from public, anon;
revoke execute on function public.assign_service_manual(uuid, uuid, uuid, uuid, text) from public, anon;
revoke execute on function public.respond_offer(uuid, boolean, text) from public, anon;
revoke execute on function public.assign_service(uuid, uuid, uuid, text) from public, anon;
revoke execute on function public.release_service(uuid, text) from public, anon;
revoke execute on function public.provider_offers(uuid) from public, anon;
revoke execute on function public.provider_services(uuid) from public, anon;
revoke execute on function public.driver_services() from public, anon;
revoke execute on function public.driver_advance_service(uuid, public.service_status) from public, anon;
grant execute on function public.list_eligible_providers(uuid) to authenticated;
grant execute on function public.dispatch_service(uuid, public.distribution_mode, uuid[], integer) to authenticated;
grant execute on function public.stop_dispatch(uuid, text) to authenticated;
grant execute on function public.assign_service_manual(uuid, uuid, uuid, uuid, text) to authenticated;
grant execute on function public.respond_offer(uuid, boolean, text) to authenticated;
grant execute on function public.assign_service(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.release_service(uuid, text) to authenticated;
grant execute on function public.provider_offers(uuid) to authenticated;
grant execute on function public.provider_services(uuid) to authenticated;
grant execute on function public.driver_services() to authenticated;
grant execute on function public.driver_advance_service(uuid, public.service_status) to authenticated;

commit;
