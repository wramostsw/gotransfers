import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FilterSelect } from "@/components/admin/filter-select";
import { AdminHeader, AdminSkeleton, DataTable, EmptyRow, Pagination, Panel, Pill, Td, Th, formatDateTime } from "@/components/admin/kit";
import { organizationNames, profileNames } from "@/lib/admin-data";
import { ACTION_LABEL, ENTITY_LABEL, auditDiff, describeAudit, type AuditRow } from "@/lib/audit";
import { requireArea } from "@/lib/auth";
import { hrefWith, oneOf, pageNumber, param, type RawParams } from "@/lib/query";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Auditoria · Admin" };

const PAGE_SIZE = 30;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ENTITIES = ["", ...Object.keys(ENTITY_LABEL)] as const;
const ACTION_TONE: Record<AuditRow["action"], "blue" | "amber" | "red"> = { insert: "blue", update: "amber", delete: "red" };

export default function AuditoriaPage({ searchParams }: PageProps<"/admin/auditoria">) {
  return (
    <>
      <AdminHeader title="Auditoria" description="Registro de quem fez o quê. Somente leitura: nada aqui pode ser editado ou apagado." />
      <Suspense fallback={<AdminSkeleton />}>
        <Content searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Content({ searchParams }: { searchParams: Promise<RawParams> }) {
  await requireArea("admin");
  const params = await searchParams;
  const period = oneOf(param(params, "periodo"), ["7", "30", "90", "365"] as const, "30");
  const entity = oneOf(param(params, "registro"), ENTITIES, "");
  const action = oneOf(param(params, "acao"), ["", "insert", "update", "delete"] as const, "");
  const orgId = UUID_RE.test(param(params, "empresa")) ? param(params, "empresa") : "";
  const selectedId = Number(param(params, "id")) || 0;
  const page = pageNumber(params);
  const current: Record<string, string> = {};
  if (period !== "30") current.periodo = period;
  if (entity) current.registro = entity;
  if (action) current.acao = action;
  if (orgId) current.empresa = orgId;
  if (page > 1) current.pagina = String(page);

  const supabase = await createClient();
  const now = new Date();
  const since = new Date(now.getTime() - Number(period) * 86_400_000).toISOString();
  let query = supabase.from("audit_logs").select("*", { count: "exact" }).gte("occurred_at", since);
  if (entity) query = query.eq("entity", entity);
  if (action) query = query.eq("action", action);
  if (orgId) query = query.eq("organization_id", orgId);
  const { data, count, error } = await query
    .order("occurred_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
    .returns<AuditRow[]>();
  const rows = data ?? [];

  let selected = rows.find((r) => r.id === selectedId) ?? null;
  if (!selected && selectedId) {
    const { data: one } = await supabase.from("audit_logs").select("*").eq("id", selectedId).maybeSingle<AuditRow>();
    selected = one ?? null;
  }
  selected ??= rows[0] ?? null;

  const [people, orgs] = await Promise.all([
    profileNames(supabase, [...rows.map((r) => r.actor_id), selected?.actor_id ?? null]),
    organizationNames(supabase, [...rows.map((r) => r.organization_id), selected?.organization_id ?? null, orgId || null]),
  ]);
  const who = (r: AuditRow) => (r.actor_id ? (people.get(r.actor_id) ?? "Usuário") : "Sistema");
  const diff = selected ? auditDiff(selected) : [];

  return (
    <>
      <div className="flex flex-wrap items-center gap-2.5">
        <FilterSelect
          name="periodo"
          label="Período"
          options={[
            { value: "7", label: "Últimos 7 dias" },
            { value: "", label: "Últimos 30 dias" },
            { value: "90", label: "Últimos 90 dias" },
            { value: "365", label: "Último ano" },
          ]}
        />
        <FilterSelect name="registro" label="Registro" options={[{ value: "", label: "Todos" }, ...Object.entries(ENTITY_LABEL).map(([value, label]) => ({ value, label }))]} />
        <FilterSelect
          name="acao"
          label="Ação"
          options={[
            { value: "", label: "Todas" },
            { value: "insert", label: "Criou" },
            { value: "update", label: "Alterou" },
            { value: "delete", label: "Removeu" },
          ]}
        />
        {orgId ? (
          <span className="flex h-[38px] items-center gap-2 rounded-[10px] bg-[#E8EEFF] px-3 text-[13px] font-semibold text-brand-800">
            Empresa: {orgs.get(orgId) ?? "—"}
            <Link href={hrefWith("/admin/auditoria", current, { empresa: null, pagina: null, id: null })} aria-label="Remover filtro de empresa" className="font-bold">
              ×
            </Link>
          </span>
        ) : null}
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <DataTable minWidth={720}>
            <thead>
              <tr>
                <Th>Quando</Th>
                <Th>Quem</Th>
                <Th>O que aconteceu</Th>
                <Th>Empresa</Th>
              </tr>
            </thead>
            <tbody>
              {error ? (
                <EmptyRow colSpan={4} title="Não foi possível carregar a auditoria" />
              ) : rows.length === 0 ? (
                <EmptyRow colSpan={4} title="Nenhum registro no período">
                  Amplie o período ou limpe os filtros.
                </EmptyRow>
              ) : (
                rows.map((r) => {
                  const active = selected?.id === r.id;
                  return (
                    <tr key={r.id} className={active ? "bg-[#F5F8FF] shadow-[inset_3px_0_0_#004AD0]" : "hover:bg-[#F8FAFD]"}>
                      <Td className="whitespace-nowrap tabular-nums text-[#33405F]">{formatDateTime(r.occurred_at)}</Td>
                      <Td className="font-semibold">{who(r)}</Td>
                      <Td>
                        <Link href={hrefWith("/admin/auditoria", current, { id: r.id })} scroll={false} className="flex items-center gap-2 hover:text-brand-800">
                          <Pill tone={ACTION_TONE[r.action]}>{ACTION_LABEL[r.action]}</Pill>
                          <span className="first-letter:uppercase">{describeAudit(r)}</span>
                        </Link>
                      </Td>
                      <Td className="text-[#33405F]">{r.organization_id ? (orgs.get(r.organization_id) ?? "—") : "Plataforma"}</Td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </DataTable>
          <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} makeHref={(p) => hrefWith("/admin/auditoria", current, { pagina: p === 1 ? null : p, id: null })} />
        </Panel>

        <Panel>
          {selected ? (
            <>
              <div className="border-b border-[#EEF1F7] px-5 py-4">
                <p className="text-xs font-bold uppercase tracking-wide text-muted">Registro selecionado</p>
                <h2 className="mt-1.5 text-base font-bold">
                  {who(selected)} {describeAudit(selected)}
                </h2>
                <p className="mt-1 text-[13px] text-muted">
                  {formatDateTime(selected.occurred_at)} · {ENTITY_LABEL[selected.entity] ?? selected.entity}
                  {selected.organization_id ? ` · ${orgs.get(selected.organization_id) ?? ""}` : ""}
                </p>
              </div>
              <div className="flex flex-col gap-2.5 px-5 py-4">
                <p className="text-[13px] font-bold">{selected.action === "insert" ? "Dados criados" : selected.action === "delete" ? "Dados removidos" : "O que mudou"}</p>
                {diff.length === 0 ? (
                  <p className="text-sm text-muted">Nenhum campo relevante mudou.</p>
                ) : (
                  <dl className="overflow-hidden rounded-xl border border-line font-mono text-[12.5px]">
                    {diff.map((d) => (
                      <div key={d.field} className="border-b border-line last:border-0">
                        <dt className="bg-[#F8FAFD] px-3 py-1.5 font-sans text-xs font-bold text-muted">{d.field}</dt>
                        {selected.action !== "insert" ? (
                          <dd className="flex gap-2 bg-danger-50 px-3 py-1.5 text-[#8C1D16]">
                            <span aria-hidden>−</span>
                            <span className="break-all">
                              <span className="sr-only">Antes: </span>
                              {d.before}
                            </span>
                          </dd>
                        ) : null}
                        {selected.action !== "delete" ? (
                          <dd className="flex gap-2 bg-success-50 px-3 py-1.5 text-[#0B5C3F]">
                            <span aria-hidden>+</span>
                            <span className="break-all">
                              <span className="sr-only">Depois: </span>
                              {d.after}
                            </span>
                          </dd>
                        ) : null}
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            </>
          ) : (
            <p className="px-5 py-10 text-center text-sm text-muted">Selecione um registro para ver os detalhes.</p>
          )}
        </Panel>
      </div>
    </>
  );
}
