-- GoTransfer · Correção da Fase 4
-- provider_offers devolvia a situação do SERVIÇO no campo "status" (a junção dos
-- dados sobrescrevia a situação da OFERTA). Agora "status" é a situação da oferta
-- e a do serviço vai em "service_status".
-- Depende de 20261115000006. Tudo acontece em uma transação.

begin;

create or replace function public.provider_offers(p_org uuid)
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
               private.service_brief(o.service_id, false)
               || jsonb_build_object('service_status', s.status,
                                     'offer_id', o.id, 'status', o.status, 'mode', o.mode,
                                     'payout_cents', o.payout_cents, 'expires_at', o.expires_at,
                                     'responded_at', o.responded_at) as item
          from public.service_offers o
          join public.services s on s.id = o.service_id
         where o.provider_org_id = p_org and o.status <> 'queued'
         order by (o.status = 'pending') desc, o.created_at desc
         limit 60
      ) x
  ), '[]'::jsonb);
end;
$$;

commit;
