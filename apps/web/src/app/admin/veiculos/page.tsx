import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FilterSelect } from "@/components/admin/filter-select";
import { AdminHeader, AdminSkeleton, DataTable, EmptyRow, Pagination, Panel, Pill, Td, Th } from "@/components/admin/kit";
import { Icon } from "@/components/icons";
import { organizationNames } from "@/lib/admin-data";
import { requireArea } from "@/lib/auth";
import { APPROVAL_LABEL, VEHICLE_STATUS_LABEL, formatPlate, type ApprovalStatus, type VehicleStatus } from "@/lib/fleet";
import { hrefWith, oneOf, pageNumber, param, type RawParams } from "@/lib/query";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Veículos · Admin" };

const PAGE_SIZE = 25;
const APPROVAL_TONE: Record<ApprovalStatus, "amber" | "green" | "red"> = { pending: "amber", approved: "green", rejected: "red" };

type Row = {
  id: string;
  organization_id: string;
  brand: string;
  model: string;
  model_year: number;
  plate: string;
  color: string | null;
  seats: number;
  luggage_large: number;
  luggage_medium: number;
  is_accessible: boolean;
  status: VehicleStatus;
  approval_status: ApprovalStatus;
  category: { name: string } | null;
};

export default function VeiculosAdminPage({ searchParams }: PageProps<"/admin/veiculos">) {
  return (
    <Suspense fallback={<AdminSkeleton />}>
      <List searchParams={searchParams} />
    </Suspense>
  );
}

async function List({ searchParams }: { searchParams: Promise<RawParams> }) {
  await requireArea("admin");
  const params = await searchParams;
  const q = param(params, "q").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
  const approval = oneOf(param(params, "aprovacao"), ["", "pending", "approved", "rejected"] as const, "");
  const status = oneOf(param(params, "status"), ["", "available", "unavailable", "maintenance"] as const, "");
  const page = pageNumber(params);
  const current: Record<string, string> = {};
  if (q) current.q = q;
  if (approval) current.aprovacao = approval;
  if (status) current.status = status;

  const supabase = await createClient();
  let query = supabase
    .from("vehicles")
    .select(
      "id, organization_id, brand, model, model_year, plate, color, seats, luggage_large, luggage_medium, is_accessible, status, approval_status, category:vehicle_categories(name)",
      { count: "exact" },
    );
  if (q) query = query.ilike("plate", `%${q}%`);
  if (approval) query = query.eq("approval_status", approval);
  if (status) query = query.eq("status", status);
  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
    .returns<Row[]>();
  const rows = data ?? [];
  const orgNames = await organizationNames(supabase, rows.map((r) => r.organization_id));

  return (
    <>
      <AdminHeader title="Veículos" description="A frota de toda a rede, com capacidade e situação de cada veículo." />
      <Panel>
        <div className="flex flex-wrap items-center gap-2.5 border-b border-[#EEF1F7] px-4 py-3.5">
          <form action="/admin/veiculos" className="flex h-[38px] min-w-56 flex-1 items-center gap-2 rounded-[10px] border border-[#DCE2EE] px-3 text-muted">
            {approval ? <input type="hidden" name="aprovacao" value={approval} /> : null}
            {status ? <input type="hidden" name="status" value={status} /> : null}
            <Icon name="search" size={16} />
            <label htmlFor="veh-q" className="sr-only">
              Buscar por placa
            </label>
            <input id="veh-q" name="q" type="search" defaultValue={q} placeholder="Placa" className="min-w-0 flex-1 bg-transparent text-sm uppercase text-ink outline-none" />
          </form>
          <FilterSelect
            name="aprovacao"
            label="Aprovação"
            options={[
              { value: "", label: "Todas" },
              { value: "pending", label: "Em análise" },
              { value: "approved", label: "Aprovados" },
              { value: "rejected", label: "Reprovados" },
            ]}
          />
          <FilterSelect
            name="status"
            label="Disponibilidade"
            options={[
              { value: "", label: "Todas" },
              { value: "available", label: "Disponível" },
              { value: "maintenance", label: "Em manutenção" },
              { value: "unavailable", label: "Indisponível" },
            ]}
          />
          {q || approval || status ? (
            <Link href="/admin/veiculos" className="text-[13px] font-semibold text-brand-600 hover:underline">
              Limpar filtros
            </Link>
          ) : null}
        </div>
        <DataTable minWidth={980}>
          <thead>
            <tr>
              <Th>Veículo</Th>
              <Th>Placa</Th>
              <Th>Empresa</Th>
              <Th>Capacidade</Th>
              <Th>Disponibilidade</Th>
              <Th>Aprovação</Th>
            </tr>
          </thead>
          <tbody>
            {error ? (
              <EmptyRow colSpan={6} title="Não foi possível carregar os veículos" />
            ) : rows.length === 0 ? (
              <EmptyRow colSpan={6} title="Nenhum veículo encontrado">
                {q || approval || status ? "Ajuste a busca ou limpe os filtros." : "Os veículos cadastrados pelas transportadoras aparecem aqui."}
              </EmptyRow>
            ) : (
              rows.map((v) => (
                <tr key={v.id} className="hover:bg-[#F8FAFD]">
                  <Td>
                    <p className="font-semibold">
                      {v.brand} {v.model} · {v.model_year}
                    </p>
                    <p className="text-xs text-muted">
                      {v.category?.name ?? "Sem categoria"}
                      {v.color ? ` · ${v.color}` : ""}
                    </p>
                  </Td>
                  <Td className="font-mono">{formatPlate(v.plate)}</Td>
                  <Td>
                    <Link href={`/admin/organizacoes/${v.organization_id}?aba=frota`} className="font-semibold text-brand-700 hover:underline">
                      {orgNames.get(v.organization_id) ?? "—"}
                    </Link>
                  </Td>
                  <Td className="text-[#33405F]">
                    {v.seats} pass. · {v.luggage_large} G + {v.luggage_medium} M{v.is_accessible ? " · acessível" : ""}
                  </Td>
                  <Td>
                    <Pill tone={v.status === "available" ? "green" : "amber"}>{VEHICLE_STATUS_LABEL[v.status]}</Pill>
                  </Td>
                  <Td>
                    <Pill tone={APPROVAL_TONE[v.approval_status]}>{APPROVAL_LABEL[v.approval_status]}</Pill>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </DataTable>
        <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} makeHref={(p) => hrefWith("/admin/veiculos", current, { pagina: p === 1 ? null : p })} />
      </Panel>
    </>
  );
}
