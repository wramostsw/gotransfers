import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FilterSelect } from "@/components/admin/filter-select";
import { AdminHeader, AdminSkeleton, DataTable, EmptyRow, Pagination, Panel, Pill, Td, Th } from "@/components/admin/kit";
import { Icon } from "@/components/icons";
import { isoDate, organizationNames } from "@/lib/admin-data";
import { requireArea } from "@/lib/auth";
import { APPROVAL_LABEL, LANGUAGE_LABEL, licenseBadge, type ApprovalStatus } from "@/lib/fleet";
import { hrefWith, likePattern, oneOf, pageNumber, param, type RawParams } from "@/lib/query";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Motoristas · Admin" };

const PAGE_SIZE = 25;
const APPROVAL_TONE: Record<ApprovalStatus, "amber" | "green" | "red"> = { pending: "amber", approved: "green", rejected: "red" };

type Row = {
  id: string;
  organization_id: string;
  user_id: string | null;
  full_name: string;
  phone: string | null;
  license_category: string;
  license_expires_at: string;
  languages: string[];
  status: "active" | "inactive";
  approval_status: ApprovalStatus;
};

export default function MotoristasAdminPage({ searchParams }: PageProps<"/admin/motoristas">) {
  return (
    <Suspense fallback={<AdminSkeleton />}>
      <List searchParams={searchParams} />
    </Suspense>
  );
}

async function List({ searchParams }: { searchParams: Promise<RawParams> }) {
  await requireArea("admin");
  const params = await searchParams;
  const q = param(params, "q").slice(0, 80);
  const approval = oneOf(param(params, "aprovacao"), ["", "pending", "approved", "rejected"] as const, "");
  const cnh = oneOf(param(params, "cnh"), ["", "vencida", "vencendo"] as const, "");
  const page = pageNumber(params);
  const current: Record<string, string> = {};
  if (q) current.q = q;
  if (approval) current.aprovacao = approval;
  if (cnh) current.cnh = cnh;

  const supabase = await createClient();
  const now = new Date();
  const today = isoDate(now);
  const in30 = isoDate(new Date(now.getTime() + 30 * 86_400_000));

  let query = supabase
    .from("drivers")
    .select("id, organization_id, user_id, full_name, phone, license_category, license_expires_at, languages, status, approval_status", { count: "exact" });
  if (q) query = query.ilike("full_name", likePattern(q));
  if (approval) query = query.eq("approval_status", approval);
  if (cnh === "vencida") query = query.lt("license_expires_at", today);
  if (cnh === "vencendo") query = query.gte("license_expires_at", today).lte("license_expires_at", in30);
  const { data, count, error } = await query
    .order("full_name")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
    .returns<Row[]>();
  const rows = data ?? [];
  const orgNames = await organizationNames(supabase, rows.map((r) => r.organization_id));

  return (
    <>
      <AdminHeader title="Motoristas" description="Todos os motoristas da rede, de todas as transportadoras e autônomos." />
      <Panel>
        <div className="flex flex-wrap items-center gap-2.5 border-b border-[#EEF1F7] px-4 py-3.5">
          <form action="/admin/motoristas" className="flex h-[38px] min-w-60 flex-1 items-center gap-2 rounded-[10px] border border-[#DCE2EE] px-3 text-muted">
            {approval ? <input type="hidden" name="aprovacao" value={approval} /> : null}
            {cnh ? <input type="hidden" name="cnh" value={cnh} /> : null}
            <Icon name="search" size={16} />
            <label htmlFor="drv-q" className="sr-only">
              Buscar motorista
            </label>
            <input id="drv-q" name="q" type="search" defaultValue={q} placeholder="Nome do motorista" className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none" />
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
            name="cnh"
            label="CNH"
            options={[
              { value: "", label: "Todas" },
              { value: "vencida", label: "Vencidas" },
              { value: "vencendo", label: "Vencem em 30 dias" },
            ]}
          />
          {q || approval || cnh ? (
            <Link href="/admin/motoristas" className="text-[13px] font-semibold text-brand-600 hover:underline">
              Limpar filtros
            </Link>
          ) : null}
        </div>
        <DataTable minWidth={980}>
          <thead>
            <tr>
              <Th>Motorista</Th>
              <Th>Empresa</Th>
              <Th>CNH</Th>
              <Th>Idiomas</Th>
              <Th>App</Th>
              <Th>Aprovação</Th>
            </tr>
          </thead>
          <tbody>
            {error ? (
              <EmptyRow colSpan={6} title="Não foi possível carregar os motoristas" />
            ) : rows.length === 0 ? (
              <EmptyRow colSpan={6} title="Nenhum motorista encontrado">
                {q || approval || cnh ? "Ajuste a busca ou limpe os filtros." : "Os motoristas cadastrados pelas transportadoras aparecem aqui."}
              </EmptyRow>
            ) : (
              rows.map((d) => {
                const license = licenseBadge(d.license_expires_at, now);
                return (
                  <tr key={d.id} className="hover:bg-[#F8FAFD]">
                    <Td>
                      <p className="font-semibold">{d.full_name}</p>
                      <p className="text-xs text-muted">
                        {d.status === "active" ? "Ativo" : "Inativo"}
                        {d.phone ? ` · ${d.phone}` : ""}
                      </p>
                    </Td>
                    <Td>
                      <Link href={`/admin/organizacoes/${d.organization_id}?aba=motoristas`} className="font-semibold text-brand-700 hover:underline">
                        {orgNames.get(d.organization_id) ?? "—"}
                      </Link>
                    </Td>
                    <Td>
                      <span className="mr-2 text-[#33405F]">Cat. {d.license_category}</span>
                      <Pill tone={license.tone === "danger" ? "red" : license.tone === "warning" ? "amber" : "gray"}>{license.text}</Pill>
                    </Td>
                    <Td className="text-[#33405F]">{d.languages.map((c) => LANGUAGE_LABEL[c] ?? c).join(", ")}</Td>
                    <Td>{d.user_id ? <Pill tone="green">Liberado</Pill> : <Pill>Sem acesso</Pill>}</Td>
                    <Td>
                      <Pill tone={APPROVAL_TONE[d.approval_status]}>{APPROVAL_LABEL[d.approval_status]}</Pill>
                    </Td>
                  </tr>
                );
              })
            )}
          </tbody>
        </DataTable>
        <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} makeHref={(p) => hrefWith("/admin/motoristas", current, { pagina: p === 1 ? null : p })} />
      </Panel>
    </>
  );
}
