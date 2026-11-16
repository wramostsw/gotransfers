import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AdminHeader, AdminSkeleton, DataTable, EmptyRow, Pagination, Panel, Pill, TabsNav, Td, Th, formatDateTime } from "@/components/admin/kit";
import { requireArea } from "@/lib/auth";
import { SERVICE_KIND_LABEL, SERVICE_STATUS_LABEL, type LocationSnapshot, type ServiceKind, type ServiceStatus } from "@/lib/bookings";
import { SERVICE_STATUS_TONE, SERVICE_TABS, type ServiceTabKey } from "@/lib/dispatch";
import { hrefWith, oneOf, pageNumber, param, type RawParams } from "@/lib/query";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Central de serviços · Admin" };

const PAGE_SIZE = 25;
const TAB_KEYS = SERVICE_TABS.map((t) => t.key) as ServiceTabKey[];

type Row = {
  id: string;
  status: ServiceStatus;
  pickup_at: string;
  distribution_round: number;
  booking: { id: string; code: string } | null;
  agency: { trade_name: string } | null;
  provider: { trade_name: string } | null;
  driver: { full_name: string } | null;
  segment: { service_kind: ServiceKind; origin_snapshot: LocationSnapshot; destination_snapshot: LocationSnapshot; pax_count: number; category: { name: string } | null } | null;
};

export default function ServicosPage({ searchParams }: PageProps<"/admin/servicos">) {
  return (
    <>
      <AdminHeader
        title="Central de serviços"
        description="Cada trecho confirmado vira um serviço. Daqui você envia ofertas às transportadoras, acompanha aceites e designações e intervém quando ninguém aceita."
      />
      <Suspense fallback={<AdminSkeleton />}>
        <List searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function List({ searchParams }: { searchParams: Promise<RawParams> }) {
  await requireArea("admin");
  const params = await searchParams;
  const tab = oneOf(param(params, "aba"), TAB_KEYS, "distribuir");
  const page = pageNumber(params);
  const current: Record<string, string> = tab === "distribuir" ? {} : { aba: tab };
  const active = SERVICE_TABS.find((t) => t.key === tab)!;

  const supabase = await createClient();
  const closed = tab === "encerrados";
  const [{ data, count, error }, ...counts] = await Promise.all([
    supabase
      .from("services")
      .select(
        "id, status, pickup_at, distribution_round, booking:bookings(id, code), agency:organizations!services_agency_id_fkey(trade_name), provider:organizations!services_provider_org_id_fkey(trade_name), driver:drivers(full_name), segment:booking_segments(service_kind, origin_snapshot, destination_snapshot, pax_count, category:vehicle_categories(name))",
        { count: "exact" },
      )
      .in("status", active.statuses as unknown as string[])
      .order("pickup_at", { ascending: !closed })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
      .returns<Row[]>(),
    ...SERVICE_TABS.map((t) => supabase.from("services").select("id", { count: "exact", head: true }).in("status", t.statuses as unknown as string[])),
  ]);
  const rows = data ?? [];
  const now = new Date().getTime();

  return (
    <Panel>
      <TabsNav
        label="Situação"
        items={SERVICE_TABS.map((t, i) => ({
          label: t.label,
          count: counts[i].count ?? 0,
          active: t.key === tab,
          href: hrefWith("/admin/servicos", {}, { aba: t.key === "distribuir" ? null : t.key }),
        }))}
      />
      <DataTable minWidth={1000}>
        <thead>
          <tr>
            <Th>Embarque</Th>
            <Th>Serviço</Th>
            <Th>Trajeto</Th>
            <Th>Agência</Th>
            <Th>Prestador</Th>
            <Th>Situação</Th>
          </tr>
        </thead>
        <tbody>
          {error ? (
            <EmptyRow colSpan={6} title="Não foi possível carregar os serviços">
              Confirme que a migração 20261115000006 foi rodada e recarregue.
            </EmptyRow>
          ) : rows.length === 0 ? (
            <EmptyRow colSpan={6} title="Nada aqui agora">
              {tab === "distribuir" ? "Quando uma agência confirmar uma reserva, o serviço aparece aqui para ser distribuído." : "Nenhum serviço nesta situação."}
            </EmptyRow>
          ) : (
            rows.map((s) => {
              const hours = (new Date(s.pickup_at).getTime() - now) / 3_600_000;
              const urgent = !closed && hours < 24 && ["awaiting_dispatch", "offered", "accepted", "awaiting_assignment"].includes(s.status);
              return (
                <tr key={s.id} className={urgent ? "bg-warning-50/60 hover:bg-warning-50" : "hover:bg-[#F8FAFD]"}>
                  <Td className="whitespace-nowrap">
                    <Link href={`/admin/servicos/${s.id}`} className="flex flex-col font-bold text-brand-800 hover:underline">
                      <span className="tabular-nums">{formatDateTime(s.pickup_at)}</span>
                      {urgent ? <span className="text-xs font-semibold text-warning-700">Menos de 24 h</span> : null}
                    </Link>
                  </Td>
                  <Td>
                    <span className="flex flex-col">
                      <span className="font-semibold">{s.segment ? SERVICE_KIND_LABEL[s.segment.service_kind] : "—"}</span>
                      <span className="text-xs text-muted">
                        {s.booking?.code} · {s.segment?.pax_count} pax · {s.segment?.category?.name}
                      </span>
                    </span>
                  </Td>
                  <Td className="max-w-72 text-[#33405F]">
                    <span className="block truncate">
                      {s.segment?.origin_snapshot.name} → {s.segment?.destination_snapshot.name}
                    </span>
                  </Td>
                  <Td className="text-[#33405F]">{s.agency?.trade_name ?? "—"}</Td>
                  <Td>
                    {s.provider ? (
                      <span className="flex flex-col">
                        <span className="font-semibold">{s.provider.trade_name}</span>
                        <span className="text-xs text-muted">{s.driver?.full_name ?? "Sem motorista"}</span>
                      </span>
                    ) : (
                      <span className="text-[13px] text-muted">{s.distribution_round > 0 ? `Rodada ${s.distribution_round}` : "—"}</span>
                    )}
                  </Td>
                  <Td>
                    <Pill tone={SERVICE_STATUS_TONE[s.status]}>{SERVICE_STATUS_LABEL[s.status]}</Pill>
                  </Td>
                </tr>
              );
            })
          )}
        </tbody>
      </DataTable>
      <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} makeHref={(p) => hrefWith("/admin/servicos", current, { pagina: p === 1 ? null : p })} />
    </Panel>
  );
}
