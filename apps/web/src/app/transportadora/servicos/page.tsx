import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell, PageHeader, PageSkeleton } from "@/components/app-shell";
import { AssignForm, ReasonAction, type FleetOption } from "@/components/dispatch-forms";
import { ServiceBriefCard } from "@/components/service-brief";
import { EmptyState, InactiveOrgNotice } from "@/components/ui";
import { orgIsActive, requireOrgRole } from "@/lib/auth";
import { SERVICE_STATUS_LABEL } from "@/lib/bookings";
import { SERVICE_STATUS_TONE, type ServiceBrief } from "@/lib/dispatch";
import { assignService, releaseService } from "@/lib/dispatch-actions";
import { formatPlate } from "@/lib/fleet";
import { CARRIER_NAV } from "@/lib/nav";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Serviços" };

const GROUPS = [
  { title: "Designar motorista e veículo", statuses: ["accepted", "awaiting_assignment"] },
  { title: "Designados", statuses: ["assigned"] },
  { title: "Em execução", statuses: ["driver_en_route", "driver_arrived", "boarding", "in_progress"] },
  { title: "Concluídos e cancelados", statuses: ["completed", "cancelled", "failed", "under_review"] },
];

export default function ServicosPage() {
  return (
    <AppShell area="Portal da transportadora" nav={CARRIER_NAV}>
      <PageHeader title="Serviços" description="Serviços que sua empresa aceitou. Designe motorista e veículo e acompanhe a execução." />
      <Suspense fallback={<PageSkeleton />}>
        <Content />
      </Suspense>
    </AppShell>
  );
}

async function Content() {
  const { membership } = await requireOrgRole("transportadora", ["carrier_admin", "carrier_dispatcher"]);
  const orgId = membership.organization.id;
  const active = orgIsActive(membership);
  const supabase = await createClient();
  const [services, drivers, vehicles] = await Promise.all([
    supabase.rpc("provider_services", { p_org: orgId }),
    supabase
      .from("drivers")
      .select("id, full_name, license_expires_at")
      .eq("organization_id", orgId)
      .eq("approval_status", "approved")
      .eq("status", "active")
      .order("full_name")
      .returns<Array<{ id: string; full_name: string; license_expires_at: string }>>(),
    supabase
      .from("vehicles")
      .select("id, brand, model, plate, seats, category:vehicle_categories(name)")
      .eq("organization_id", orgId)
      .eq("approval_status", "approved")
      .eq("status", "available")
      .order("brand")
      .returns<Array<{ id: string; brand: string; model: string; plate: string; seats: number; category: { name: string } | null }>>(),
  ]);
  const list = (Array.isArray(services.data) ? services.data : []) as ServiceBrief[];
  const driverOptions: FleetOption[] = (drivers.data ?? []).map((d) => ({ id: d.id, org_id: orgId, label: d.full_name }));
  const vehiclesFor = (category: string): FleetOption[] =>
    (vehicles.data ?? [])
      .filter((v) => v.category?.name === category)
      .map((v) => ({ id: v.id, org_id: orgId, label: `${v.brand} ${v.model} · ${formatPlate(v.plate)} · ${v.seats} lugares` }));

  if (services.error) return <EmptyState title="Não foi possível carregar os serviços">Tente recarregar a página.</EmptyState>;

  return (
    <div className="flex flex-col gap-8">
      {active ? null : <InactiveOrgNotice orgName={membership.organization.tradeName} status={membership.organization.status} />}
      {list.length === 0 ? <EmptyState title="Nenhum serviço ainda">Os serviços aparecem aqui depois que sua empresa aceita uma oferta.</EmptyState> : null}
      {GROUPS.map((g) => {
        const items = list.filter((s) => g.statuses.includes(s.status));
        if (items.length === 0) return null;
        const sorted = g.title.startsWith("Concluídos") ? [...items].reverse() : items;
        return (
          <section key={g.title} className="flex flex-col gap-3">
            <h2 className="text-base font-bold text-ink">
              {g.title} ({items.length})
            </h2>
            <ul className="grid gap-3 lg:grid-cols-2">
              {sorted.map((s) => {
                const canAssign = active && (s.status === "awaiting_assignment" || s.status === "assigned");
                const compatible = vehiclesFor(s.category);
                return (
                  <li key={s.service_id}>
                    <ServiceBriefCard brief={s} badge={{ label: SERVICE_STATUS_LABEL[s.status], tone: SERVICE_STATUS_TONE[s.status] }} payoutCents={s.payout_cents}>
                      {canAssign && s.status === "awaiting_assignment" ? (
                        <div className="rounded-xl border border-line p-4">
                          {compatible.length === 0 || driverOptions.length === 0 ? (
                            <p className="mb-3 text-sm text-warning-700">
                              {compatible.length === 0 ? `Nenhum veículo aprovado e disponível da categoria ${s.category}. ` : ""}
                              {driverOptions.length === 0 ? "Nenhum motorista aprovado e ativo." : ""}
                            </p>
                          ) : null}
                          <AssignForm action={assignService.bind(null, s.service_id)} drivers={driverOptions} vehicles={compatible} requireReason={false} />
                        </div>
                      ) : null}
                      {canAssign && s.status === "assigned" ? (
                        <details className="rounded-xl border border-line">
                          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Trocar motorista ou veículo</summary>
                          <div className="border-t border-line p-4">
                            <AssignForm action={assignService.bind(null, s.service_id)} drivers={driverOptions} vehicles={compatible} requireReason submitLabel="Substituir" />
                          </div>
                        </details>
                      ) : null}
                      {canAssign ? (
                        <ReasonAction action={releaseService.bind(null, s.service_id)} summary="Não vamos conseguir atender" button="Devolver o serviço à GoTransfer" />
                      ) : null}
                    </ServiceBriefCard>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
