import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AdminHeader, AdminSkeleton, DataTable, Panel, PanelHeader, Pill, Td, Th, formatDateTime } from "@/components/admin/kit";
import { SegmentCard } from "@/components/booking-view";
import { AssignForm, DispatchForm, ReasonAction, type FleetOption, type ProviderOption } from "@/components/dispatch-forms";
import { requireArea } from "@/lib/auth";
import type { SegmentRecord } from "@/lib/booking-data";
import { SERVICE_STATUS_LABEL, UUID_RE, formatMoney, type ServiceStatus } from "@/lib/bookings";
import { MODE_LABEL, OFFER_STATUS_LABEL, OFFER_STATUS_TONE, SERVICE_STATUS_TONE, type DistributionMode, type OfferStatus } from "@/lib/dispatch";
import { assignManual, assignService, dispatchService, releaseService, stopDispatch } from "@/lib/dispatch-actions";
import { formatPlate } from "@/lib/fleet";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Serviço · Admin" };

type ServiceRow = {
  id: string;
  status: ServiceStatus;
  pickup_at: string;
  distribution_round: number;
  segment_id: string;
  booking_id: string;
  provider_org_id: string | null;
  booking: { code: string; agency: { trade_name: string } | null; passenger: { full_name: string; phone: string | null } | null } | null;
  provider: { trade_name: string } | null;
  driver: { full_name: string; phone: string | null } | null;
  vehicle: { brand: string; model: string; plate: string } | null;
};
type OfferRow = {
  id: string;
  round: number;
  mode: DistributionMode;
  status: OfferStatus;
  position: number;
  payout_cents: number;
  expires_at: string | null;
  responded_at: string | null;
  decline_reason: string | null;
  provider: { trade_name: string } | null;
};
type AssignmentRow = {
  id: string;
  is_active: boolean;
  reason: string | null;
  created_at: string;
  ended_at: string | null;
  provider: { trade_name: string } | null;
  driver: { full_name: string } | null;
  vehicle: { plate: string } | null;
};
type EventRow = { id: number; from_status: ServiceStatus | null; to_status: ServiceStatus; origin: string; reason: string | null; occurred_at: string };

const ORIGIN_LABEL: Record<string, string> = { agency: "Agência", platform: "GoTransfer", provider: "Prestador", driver: "Motorista", system: "Sistema" };

export default function ServicoPage({ params }: PageProps<"/admin/servicos/[id]">) {
  return (
    <Suspense fallback={<AdminSkeleton />}>
      <Detail params={params} />
    </Suspense>
  );
}

async function Detail({ params }: { params: Promise<{ id: string }> }) {
  await requireArea("admin");
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const supabase = await createClient();

  const { data: svc } = await supabase
    .from("services")
    .select(
      "id, status, pickup_at, distribution_round, segment_id, booking_id, provider_org_id, booking:bookings(code, agency:organizations(trade_name), passenger:passengers(full_name, phone)), provider:organizations!services_provider_org_id_fkey(trade_name), driver:drivers(full_name, phone), vehicle:vehicles(brand, model, plate)",
    )
    .eq("id", id)
    .maybeSingle<ServiceRow>();
  if (!svc) notFound();

  const [segment, cost, offers, assignments, events, eligible, setting, carriers, drivers, vehicles] = await Promise.all([
    supabase
      .from("booking_segments")
      .select(
        "id, position, service_kind, origin_snapshot, destination_snapshot, pickup_at, trip_reference, pax_count, luggage_large, luggage_medium, needs_accessible, child_seats, notes, distance_km, duration_min, pricing_mode, sale_price_cents, quote_valid_until, status, cancel_reason, category_id, category:vehicle_categories(name)",
      )
      .eq("id", svc.segment_id)
      .maybeSingle<SegmentRecord & { category_id: string }>(),
    supabase.from("segment_costs").select("provider_payout_cents, platform_fee_cents").eq("segment_id", svc.segment_id).maybeSingle<{ provider_payout_cents: number; platform_fee_cents: number }>(),
    supabase
      .from("service_offers")
      .select("id, round, mode, status, position, payout_cents, expires_at, responded_at, decline_reason, provider:organizations(trade_name)")
      .eq("service_id", id)
      .order("round", { ascending: false })
      .order("position")
      .returns<OfferRow[]>(),
    supabase
      .from("service_assignments")
      .select("id, is_active, reason, created_at, ended_at, provider:organizations(trade_name), driver:drivers(full_name), vehicle:vehicles(plate)")
      .eq("service_id", id)
      .order("created_at", { ascending: false })
      .returns<AssignmentRow[]>(),
    supabase.from("service_events").select("id, from_status, to_status, origin, reason, occurred_at").eq("service_id", id).order("occurred_at").returns<EventRow[]>(),
    supabase.rpc("list_eligible_providers", { p_service: id }),
    supabase.from("platform_settings").select("value").eq("key", "offer_accept_window_sec").maybeSingle<{ value: number }>(),
    supabase.from("organizations").select("id, trade_name, is_individual").eq("type", "transport_company").eq("status", "active").order("trade_name").returns<Array<{ id: string; trade_name: string; is_individual: boolean }>>(),
    supabase.from("drivers").select("id, full_name, organization_id, license_expires_at").eq("approval_status", "approved").eq("status", "active").order("full_name").returns<Array<{ id: string; full_name: string; organization_id: string; license_expires_at: string }>>(),
    supabase
      .from("vehicles")
      .select("id, brand, model, plate, seats, organization_id, category_id")
      .eq("approval_status", "approved")
      .eq("status", "available")
      .order("brand")
      .returns<Array<{ id: string; brand: string; model: string; plate: string; seats: number; organization_id: string; category_id: string }>>(),
  ]);
  const seg = segment.data;
  const providers = (Array.isArray(eligible.data) ? eligible.data : []) as ProviderOption[];
  const windowMin = Math.max(1, Math.round(Number(setting.data?.value ?? 90) / 60));
  const categoryId = seg?.category_id;
  const fleetDrivers: FleetOption[] = (drivers.data ?? []).map((d) => ({ id: d.id, org_id: d.organization_id, label: `${d.full_name} · CNH até ${d.license_expires_at.split("-").reverse().join("/")}` }));
  const fleetVehicles: FleetOption[] = (vehicles.data ?? [])
    .filter((v) => v.category_id === categoryId)
    .map((v) => ({ id: v.id, org_id: v.organization_id, label: `${v.brand} ${v.model} · ${formatPlate(v.plate)} · ${v.seats} lugares` }));
  const ownDrivers = fleetDrivers.filter((d) => d.org_id === svc.provider_org_id);
  const ownVehicles = fleetVehicles.filter((v) => v.org_id === svc.provider_org_id);

  const canDispatch = ["awaiting_dispatch", "offered"].includes(svc.status);
  const canManual = ["awaiting_dispatch", "offered", "awaiting_assignment", "assigned"].includes(svc.status);
  const canAssign = ["awaiting_assignment", "assigned"].includes(svc.status) && svc.provider_org_id;
  const now = new Date().getTime();

  return (
    <>
      <AdminHeader
        title={`Serviço · ${svc.booking?.code ?? ""}${seg ? ` · trecho ${seg.position}` : ""}`}
        crumbs={[{ label: "Central de serviços", href: "/admin/servicos" }, { label: svc.booking?.code ?? "Serviço" }]}
        actions={<Pill tone={SERVICE_STATUS_TONE[svc.status]}>{SERVICE_STATUS_LABEL[svc.status]}</Pill>}
      />

      <div className="grid items-start gap-4 xl:grid-cols-3">
        <div className="flex flex-col gap-4 xl:col-span-2">
          {seg ? <SegmentCard segment={seg} expired={false} title={`Embarque ${formatDateTime(svc.pickup_at)}`} /> : null}

          {canDispatch ? (
            <Panel>
              <PanelHeader
                title={svc.status === "offered" ? `Nova rodada (rodada ${svc.distribution_round} em andamento)` : "Enviar oferta"}
                description="Só aparecem prestadores ativos com veículo aprovado desta categoria e motorista com CNH válida. Enviar outra rodada encerra a atual."
              />
              <div className="p-5">
                <DispatchForm action={dispatchService.bind(null, svc.id)} providers={providers} defaultWindowMin={windowMin} />
              </div>
            </Panel>
          ) : null}

          {canAssign ? (
            <Panel>
              <PanelHeader
                title={svc.status === "assigned" ? "Substituir motorista ou veículo" : "Designar pelo prestador"}
                description={`Em nome de ${svc.provider?.trade_name ?? "prestador"}. Normalmente quem faz isso é a própria transportadora.`}
              />
              <div className="p-5">
                <AssignForm
                  action={assignService.bind(null, svc.id)}
                  drivers={ownDrivers}
                  vehicles={ownVehicles}
                  requireReason={svc.status === "assigned"}
                  submitLabel={svc.status === "assigned" ? "Substituir" : "Designar"}
                />
              </div>
            </Panel>
          ) : null}

          {canManual ? (
            <Panel>
              <details>
                <summary className="cursor-pointer px-5 py-4 text-base font-bold">Atribuição manual</summary>
                <div className="border-t border-[#EEF1F7] p-5">
                  <p className="mb-4 text-sm text-muted">
                    Escolha diretamente prestador, motorista e veículo, sem oferta. Encerra ofertas abertas e, se mudar o prestador, retira o atual. A justificativa fica na
                    auditoria.
                  </p>
                  <AssignForm
                    action={assignManual.bind(null, svc.id)}
                    drivers={fleetDrivers}
                    vehicles={fleetVehicles}
                    providers={(carriers.data ?? []).map((c) => ({ id: c.id, label: `${c.trade_name}${c.is_individual ? " · autônomo" : ""}` }))}
                    currentProvider={svc.provider_org_id}
                    requireReason
                    submitLabel="Atribuir"
                  />
                </div>
              </details>
            </Panel>
          ) : null}

          <Panel>
            <PanelHeader title="Ofertas" description="Todas as rodadas, da mais recente para a mais antiga." />
            {(offers.data ?? []).length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted">Nenhuma oferta enviada ainda.</p>
            ) : (
              <DataTable minWidth={720}>
                <thead>
                  <tr>
                    <Th>Rodada</Th>
                    <Th>Prestador</Th>
                    <Th>Modalidade</Th>
                    <Th>Situação</Th>
                    <Th>Prazo / resposta</Th>
                  </tr>
                </thead>
                <tbody>
                  {(offers.data ?? []).map((o) => {
                    const late = o.status === "pending" && o.expires_at && new Date(o.expires_at).getTime() < now;
                    return (
                      <tr key={o.id}>
                        <Td className="tabular-nums">
                          {o.round}
                          {o.mode === "sequential" ? <span className="text-xs text-muted"> · {o.position}º</span> : null}
                        </Td>
                        <Td className="font-semibold">{o.provider?.trade_name ?? "—"}</Td>
                        <Td className="text-[#33405F]">{MODE_LABEL[o.mode]}</Td>
                        <Td>
                          {late ? <Pill tone="gray">Vencida</Pill> : <Pill tone={OFFER_STATUS_TONE[o.status]}>{OFFER_STATUS_LABEL[o.status]}</Pill>}
                          {o.decline_reason ? <span className="mt-1 block text-xs text-muted">“{o.decline_reason}”</span> : null}
                        </Td>
                        <Td className="whitespace-nowrap tabular-nums text-[#33405F]">
                          {o.responded_at ? `Respondeu ${formatDateTime(o.responded_at)}` : o.expires_at ? `Até ${formatDateTime(o.expires_at)}` : "—"}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </DataTable>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="Histórico" description="Cada mudança de estado, com quem fez e por quê." />
            <ul>
              {(events.data ?? []).map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[#F1F4F9] px-5 py-3 text-sm last:border-0">
                  <span className="w-36 shrink-0 tabular-nums text-muted">{formatDateTime(e.occurred_at)}</span>
                  <span className="font-semibold">{SERVICE_STATUS_LABEL[e.to_status]}</span>
                  <span className="text-[13px] text-muted">
                    {ORIGIN_LABEL[e.origin] ?? e.origin}
                    {e.reason ? ` · ${e.reason}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <div className="flex flex-col gap-4">
          <Panel>
            <PanelHeader title="Resumo" />
            <dl className="flex flex-col gap-3 px-5 py-4 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Reserva</dt>
                <dd>
                  <Link href={`/admin/reservas/${svc.booking_id}`} className="font-semibold text-brand-800 hover:underline">
                    {svc.booking?.code}
                  </Link>
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Agência</dt>
                <dd className="text-right font-semibold">{svc.booking?.agency?.trade_name ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Passageiro</dt>
                <dd className="text-right font-semibold">
                  {svc.booking?.passenger?.full_name ?? "—"}
                  {svc.booking?.passenger?.phone ? <span className="block text-[13px] font-normal text-muted">{svc.booking.passenger.phone}</span> : null}
                </dd>
              </div>
              <div className="flex justify-between gap-3 border-t border-[#EEF1F7] pt-3">
                <dt className="text-muted">Agência paga</dt>
                <dd className="font-bold">{formatMoney(seg?.sale_price_cents ?? null)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Prestador recebe</dt>
                <dd className="font-bold">{formatMoney(cost.data?.provider_payout_cents ?? null)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Taxa GoTransfer</dt>
                <dd className="font-bold text-success-700">{formatMoney(cost.data?.platform_fee_cents ?? null)}</dd>
              </div>
              <div className="flex justify-between gap-3 border-t border-[#EEF1F7] pt-3">
                <dt className="text-muted">Prestador</dt>
                <dd className="text-right font-semibold">{svc.provider?.trade_name ?? "Ainda não definido"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Motorista</dt>
                <dd className="text-right font-semibold">
                  {svc.driver?.full_name ?? "—"}
                  {svc.driver?.phone ? <span className="block text-[13px] font-normal text-muted">{svc.driver.phone}</span> : null}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Veículo</dt>
                <dd className="text-right font-semibold">{svc.vehicle ? `${svc.vehicle.brand} ${svc.vehicle.model} · ${formatPlate(svc.vehicle.plate)}` : "—"}</dd>
              </div>
            </dl>
          </Panel>

          {svc.status === "offered" || canAssign ? (
            <Panel>
              <PanelHeader title="Intervenções" />
              <div className="flex flex-col gap-3 px-5 py-4">
                {svc.status === "offered" ? (
                  <ReasonAction action={stopDispatch.bind(null, svc.id)} summary="Interromper a distribuição" button="Interromper" required={false} />
                ) : null}
                {canAssign ? <ReasonAction action={releaseService.bind(null, svc.id)} summary="Retirar o prestador e voltar à central" button="Retirar prestador" /> : null}
              </div>
            </Panel>
          ) : null}

          {(assignments.data ?? []).length > 0 ? (
            <Panel>
              <PanelHeader title="Designações" />
              <ul>
                {(assignments.data ?? []).map((a) => (
                  <li key={a.id} className="border-b border-[#F1F4F9] px-5 py-3 text-sm last:border-0">
                    <p className="flex items-center justify-between gap-2 font-semibold">
                      {a.driver?.full_name} · {a.vehicle ? formatPlate(a.vehicle.plate) : ""}
                      {a.is_active ? <Pill tone="green">Atual</Pill> : <Pill>Anterior</Pill>}
                    </p>
                    <p className="text-[13px] text-muted">
                      {a.provider?.trade_name} · {formatDateTime(a.created_at)}
                      {a.reason ? ` · ${a.reason}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </div>
      </div>
    </>
  );
}
