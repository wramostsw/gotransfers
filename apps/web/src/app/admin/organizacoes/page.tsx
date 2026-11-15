import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FilterSelect } from "@/components/admin/filter-select";
import {
  AdminHeader,
  AdminSkeleton,
  Avatar,
  DataTable,
  EmptyRow,
  Pagination,
  Panel,
  Pill,
  TabsNav,
  Td,
  Th,
  avatarColor,
  btn,
  formatDay,
  initials,
} from "@/components/admin/kit";
import { Icon } from "@/components/icons";
import { requireArea } from "@/lib/auth";
import { ORG_STATUS_TONE, formatTaxId, orgQuery, orgTypeLabel, readOrgFilters, type OrgRow } from "@/lib/orgs";
import { hrefWith, pageNumber, type RawParams } from "@/lib/query";
import { ORG_STATUS_LABEL, type MemberRole } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Organizações · Admin" };

const PAGE_SIZE = 20;

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

export default function OrganizacoesPage({ searchParams }: PageProps<"/admin/organizacoes">) {
  return (
    <Suspense fallback={<AdminSkeleton />}>
      <List searchParams={searchParams} />
    </Suspense>
  );
}

async function List({ searchParams }: { searchParams: Promise<RawParams> }) {
  await requireArea("admin");
  const params = await searchParams;
  const filters = readOrgFilters(params);
  const page = pageNumber(params);
  const current: Record<string, string> = {};
  if (filters.tab !== "todas") current.tipo = filters.tab;
  if (filters.status) current.status = filters.status;
  if (filters.q) current.q = filters.q;

  const supabase = await createClient();
  const head = { count: "exact" as const, head: true };
  const [{ data, count, error }, all, agencies, carriers, solo] = await Promise.all([
    orgQuery(supabase, filters).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1).returns<OrgRow[]>(),
    supabase.from("organizations").select("id", head).neq("type", "platform"),
    supabase.from("organizations").select("id", head).eq("type", "agency"),
    supabase.from("organizations").select("id", head).eq("type", "transport_company").eq("is_individual", false),
    supabase.from("organizations").select("id", head).eq("type", "transport_company").eq("is_individual", true),
  ]);
  const rows = data ?? [];
  const ids = rows.map((r) => r.id);

  // Contagens da página atual: equipe, frota e responsável.
  const [members, vehicles, drivers] = ids.length
    ? await Promise.all([
        supabase.from("memberships").select("organization_id, user_id, role").in("organization_id", ids).eq("status", "active"),
        supabase.from("vehicles").select("organization_id").in("organization_id", ids),
        supabase.from("drivers").select("organization_id").in("organization_id", ids),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];
  type M = { organization_id: string; user_id: string; role: MemberRole };
  const memberRows = (members.data ?? []) as M[];
  const adminIds = memberRows.filter((m) => m.role === "agency_admin" || m.role === "carrier_admin").map((m) => m.user_id);
  const { data: profiles } = adminIds.length
    ? await supabase.from("profiles").select("id, full_name, email").in("id", [...new Set(adminIds)])
    : { data: [] as Array<{ id: string; full_name: string; email: string | null }> };
  const profileName = new Map((profiles ?? []).map((p) => [p.id, p.full_name || p.email || "—"]));
  const tally = (list: Array<{ organization_id: string }>) =>
    list.reduce<Record<string, number>>((acc, r) => ((acc[r.organization_id] = (acc[r.organization_id] ?? 0) + 1), acc), {});
  const memberCount = tally(memberRows);
  const vehicleCount = tally((vehicles.data ?? []) as Array<{ organization_id: string }>);
  const driverCount = tally((drivers.data ?? []) as Array<{ organization_id: string }>);
  const owner = (orgId: string) => {
    const m = memberRows.find((x) => x.organization_id === orgId && (x.role === "agency_admin" || x.role === "carrier_admin"));
    return m ? `${profileName.get(m.user_id) ?? "—"}` : "Sem administrador";
  };

  const tab = (key: string, label: string, n: number | null) => ({
    label,
    count: n ?? 0,
    active: filters.tab === key,
    href: hrefWith("/admin/organizacoes", { ...current, tipo: "" }, { tipo: key === "todas" ? null : key, pagina: null }),
  });
  const exportHref = hrefWith("/admin/organizacoes/exportar", current, {});

  return (
    <>
      <AdminHeader
        title="Organizações"
        description="Agências, transportadoras e motoristas autônomos do marketplace."
        actions={
          <>
            <a href={exportHref} className={btn.secondary}>
              <Icon name="download" size={16} />
              Exportar CSV
            </a>
            <Link href="/admin/organizacoes/nova" className={btn.primary}>
              <Icon name="plus" size={16} strokeWidth={2.4} />
              Nova organização
            </Link>
          </>
        }
      />

      <Panel>
        <TabsNav
          label="Tipo de organização"
          items={[
            tab("todas", "Todas", all.count),
            tab("agencias", "Agências", agencies.count),
            tab("transportadoras", "Transportadoras", carriers.count),
            tab("autonomos", "Autônomos", solo.count),
          ]}
        />
        <div className="flex flex-wrap items-center gap-2.5 border-b border-[#EEF1F7] px-4 py-3.5">
          <form action="/admin/organizacoes" className="flex h-[38px] min-w-60 flex-1 items-center gap-2 rounded-[10px] border border-[#DCE2EE] px-3 text-muted">
            {filters.tab !== "todas" ? <input type="hidden" name="tipo" value={filters.tab} /> : null}
            {filters.status ? <input type="hidden" name="status" value={filters.status} /> : null}
            <Icon name="search" size={16} />
            <label htmlFor="org-q" className="sr-only">
              Buscar organização
            </label>
            <input id="org-q" name="q" type="search" defaultValue={filters.q} placeholder="Nome ou CNPJ" className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none" />
          </form>
          <FilterSelect
            name="status"
            label="Status"
            options={[
              { value: "", label: "Todos" },
              { value: "pending", label: "Em análise" },
              { value: "active", label: "Ativas" },
              { value: "suspended", label: "Suspensas" },
              { value: "blocked", label: "Bloqueadas" },
            ]}
          />
          {filters.q || filters.status ? (
            <Link href={hrefWith("/admin/organizacoes", current, { q: null, status: null, pagina: null })} className="text-[13px] font-semibold text-brand-600 hover:underline">
              Limpar filtros
            </Link>
          ) : null}
        </div>

        <DataTable minWidth={900}>
          <thead>
            <tr>
              <Th>Empresa</Th>
              <Th>Tipo</Th>
              <Th>Status</Th>
              <Th>Responsável</Th>
              <Th align="right">Usuários</Th>
              <Th>Frota</Th>
              <Th>Criada em</Th>
            </tr>
          </thead>
          <tbody>
            {error ? (
              <EmptyRow colSpan={7} title="Não foi possível carregar as organizações">
                Tente recarregar a página.
              </EmptyRow>
            ) : rows.length === 0 ? (
              <EmptyRow colSpan={7} title={filters.q || filters.status ? "Nenhuma organização com esses filtros" : "Nenhuma organização cadastrada"}>
                {filters.q || filters.status ? "Ajuste a busca ou limpe os filtros." : "Cadastre a primeira agência ou transportadora."}
              </EmptyRow>
            ) : (
              rows.map((o) => (
                <tr key={o.id} className="hover:bg-[#F8FAFD]">
                  <Td>
                    <Link href={`/admin/organizacoes/${o.id}`} className="flex items-center gap-2.5 font-bold hover:text-brand-800">
                      <Avatar text={initials(o.trade_name)} color={avatarColor(o.id)} />
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate">{o.trade_name}</span>
                        <span className="text-xs font-normal text-muted">{formatTaxId(o.tax_id)}</span>
                      </span>
                    </Link>
                  </Td>
                  <Td className="text-[#33405F]">{orgTypeLabel(o)}</Td>
                  <Td>
                    <Pill tone={ORG_STATUS_TONE[o.status]}>{ORG_STATUS_LABEL[o.status]}</Pill>
                  </Td>
                  <Td className="text-[#33405F]">{owner(o.id)}</Td>
                  <Td align="right">{memberCount[o.id] ?? 0}</Td>
                  <Td className="text-[#33405F]">
                    {o.type === "transport_company" ? `${plural(vehicleCount[o.id] ?? 0, "veículo", "veículos")} · ${plural(driverCount[o.id] ?? 0, "motorista", "motoristas")}` : "—"}
                  </Td>
                  <Td className="tabular-nums text-[#33405F]">{formatDay(o.created_at)}</Td>
                </tr>
              ))
            )}
          </tbody>
        </DataTable>
        <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} makeHref={(p) => hrefWith("/admin/organizacoes", current, { pagina: p === 1 ? null : p })} />
      </Panel>
    </>
  );
}
