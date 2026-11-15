import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ConfirmButton } from "@/components/admin/confirm-button";
import {
  AdminHeader,
  AdminSkeleton,
  Avatar,
  DataTable,
  EmptyRow,
  Panel,
  PanelHeader,
  Pill,
  TabsNav,
  Td,
  Th,
  avatarColor,
  btn,
  formatDateTime,
  formatDay,
  initials,
} from "@/components/admin/kit";
import { profileNames } from "@/lib/admin-data";
import { describeAudit, type AuditRow } from "@/lib/audit";
import { requireArea } from "@/lib/auth";
import { APPROVAL_LABEL, LANGUAGE_LABEL, VEHICLE_STATUS_LABEL, formatPlate, licenseBadge, type ApprovalStatus, type VehicleStatus } from "@/lib/fleet";
import { ORG_STATUS_TONE, formatTaxId, orgTypeLabel, type OrgRow } from "@/lib/orgs";
import { oneOf, param, type RawParams } from "@/lib/query";
import { ORG_STATUS_LABEL, ROLE_LABEL, type MemberRole } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { revokeMember, setOrganizationStatus } from "../../actions";
import { AddMemberForm, EditOrganizationForm } from "../../admin-forms";

export const metadata: Metadata = { title: "Organização · Admin" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TABS = ["visao", "equipe", "frota", "motoristas", "historico"] as const;
type Tab = (typeof TABS)[number];

const APPROVAL_TONE: Record<ApprovalStatus, "amber" | "green" | "red"> = { pending: "amber", approved: "green", rejected: "red" };

export default function OrganizacaoPage({ params, searchParams }: PageProps<"/admin/organizacoes/[id]">) {
  return (
    <Suspense fallback={<AdminSkeleton />}>
      <Detail params={params} searchParams={searchParams} />
    </Suspense>
  );
}

type MemberRow = { id: string; user_id: string; role: MemberRole; created_at: string };
type VehicleRow = {
  id: string;
  brand: string;
  model: string;
  model_year: number;
  plate: string;
  seats: number;
  luggage_large: number;
  luggage_medium: number;
  status: VehicleStatus;
  approval_status: ApprovalStatus;
  category: { name: string } | null;
};
type DriverRow = {
  id: string;
  user_id: string | null;
  full_name: string;
  license_category: string;
  license_expires_at: string;
  languages: string[];
  status: "active" | "inactive";
  approval_status: ApprovalStatus;
};

async function Detail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<RawParams> }) {
  const { session } = await requireArea("admin");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!UUID_RE.test(id)) notFound();
  const tab: Tab = oneOf(param(sp, "aba"), TABS, "visao");

  const supabase = await createClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("id, type, trade_name, legal_name, tax_id, is_individual, status, created_at")
    .eq("id", id)
    .maybeSingle<OrgRow>();
  if (!org) notFound();

  const isCarrier = org.type === "transport_company";
  const head = { count: "exact" as const, head: true };
  const [membersRes, vTotal, vApproved, dTotal, dApproved, docsPending] = await Promise.all([
    supabase.from("memberships").select("id, user_id, role, created_at").eq("organization_id", id).eq("status", "active").order("created_at").returns<MemberRow[]>(),
    supabase.from("vehicles").select("id", head).eq("organization_id", id),
    supabase.from("vehicles").select("id", head).eq("organization_id", id).eq("approval_status", "approved"),
    supabase.from("drivers").select("id", head).eq("organization_id", id),
    supabase.from("drivers").select("id", head).eq("organization_id", id).eq("approval_status", "approved"),
    supabase.from("drivers").select("id", head).eq("organization_id", id).eq("approval_status", "pending"),
  ]);
  const members = membersRes.data ?? [];
  const names = await profileNames(supabase, members.map((m) => m.user_id));
  const base = `/admin/organizacoes/${id}`;
  const tabHref = (t: Tab) => (t === "visao" ? base : `${base}?aba=${t}`);

  const tabs = [
    { label: "Visão geral", href: tabHref("visao"), active: tab === "visao" },
    { label: "Equipe", href: tabHref("equipe"), count: members.length, active: tab === "equipe" },
    ...(isCarrier
      ? [
          { label: "Frota", href: tabHref("frota"), count: vTotal.count ?? 0, active: tab === "frota" },
          { label: "Motoristas", href: tabHref("motoristas"), count: dTotal.count ?? 0, active: tab === "motoristas" },
        ]
      : []),
    { label: "Histórico", href: tabHref("historico"), active: tab === "historico" },
  ];

  const statusActions: Array<{ to: "active" | "suspended" | "blocked"; label: string; confirm?: string; style: string }> = [];
  if (org.status !== "active") statusActions.push({ to: "active", label: org.status === "pending" ? "Aprovar empresa" : "Reativar", style: btn.primary });
  if (org.status === "active") statusActions.push({ to: "suspended", label: "Suspender", confirm: `Suspender ${org.trade_name}? A empresa só poderá consultar dados, sem cadastrar nem alterar.`, style: btn.danger });
  if (org.status !== "blocked") statusActions.push({ to: "blocked", label: "Bloquear", confirm: `Bloquear ${org.trade_name}? A empresa só poderá consultar dados.`, style: btn.danger });

  return (
    <>
      <AdminHeader title={org.trade_name} crumbs={[{ label: "Organizações", href: "/admin/organizacoes" }, { label: org.trade_name }]} />

      <Panel className="flex flex-wrap items-center gap-4 px-5 py-4.5">
        <span aria-hidden className="grid size-14 place-items-center rounded-[14px] text-xl font-extrabold text-white" style={{ background: avatarColor(org.id) }}>
          {initials(org.trade_name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={ORG_STATUS_TONE[org.status]}>{ORG_STATUS_LABEL[org.status]}</Pill>
            <Pill>{orgTypeLabel(org)}</Pill>
          </div>
          <p className="mt-1.5 text-sm text-muted">
            {org.legal_name} · {formatTaxId(org.tax_id)} · desde {formatDay(org.created_at)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          {statusActions.map((a) => (
            <form key={a.to} action={setOrganizationStatus.bind(null, org.id, a.to)}>
              {a.confirm ? (
                <ConfirmButton message={a.confirm} className={a.style}>
                  {a.label}
                </ConfirmButton>
              ) : (
                <button className={a.style}>{a.label}</button>
              )}
            </form>
          ))}
        </div>
      </Panel>

      <Panel>
        <TabsNav label="Seções da organização" items={tabs} />
      </Panel>

      {tab === "visao" ? (
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="flex flex-col gap-4 xl:col-span-2">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: "Usuários com acesso", value: String(members.length), note: "nesta empresa" },
                ...(isCarrier
                  ? [
                      { label: "Veículos aprovados", value: `${vApproved.count ?? 0} de ${vTotal.count ?? 0}`, note: "na frota" },
                      { label: "Motoristas aprovados", value: `${dApproved.count ?? 0} de ${dTotal.count ?? 0}`, note: `${docsPending.count ?? 0} em análise` },
                    ]
                  : [{ label: "Reservas", value: "—", note: "disponível na Fase 3" }]),
                { label: "Serviços (30 dias)", value: "—", note: "disponível na Fase 4" },
              ].map((s) => (
                <Panel key={s.label} className="px-4 py-3.5">
                  <p className="text-xs font-semibold text-muted">{s.label}</p>
                  <p className="mt-1.5 font-display text-2xl font-extrabold tabular-nums">{s.value}</p>
                  <p className="mt-0.5 text-xs text-muted">{s.note}</p>
                </Panel>
              ))}
            </div>
            <Panel>
              <PanelHeader title="Dados da empresa" description="Alterações ficam registradas no histórico." />
              <div className="p-5">
                <EditOrganizationForm
                  organizationId={org.id}
                  initialValues={{ trade_name: org.trade_name, legal_name: org.legal_name, tax_id: org.tax_id ?? "" }}
                />
              </div>
            </Panel>
          </div>
          <div className="flex flex-col gap-4">
            <Panel className="px-5 py-4.5">
              <h2 className="mb-3 text-base font-bold">Responsáveis</h2>
              {members.filter((m) => m.role === "agency_admin" || m.role === "carrier_admin").length === 0 ? (
                <p className="text-sm text-muted">
                  Nenhum administrador ainda.{" "}
                  <Link href={tabHref("equipe")} className="font-semibold text-brand-600 hover:underline">
                    Liberar acesso
                  </Link>
                </p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {members
                    .filter((m) => m.role === "agency_admin" || m.role === "carrier_admin")
                    .map((m) => {
                      const name = names.get(m.user_id) ?? "Usuário";
                      return (
                        <li key={m.id} className="flex items-center gap-3">
                          <Avatar text={initials(name)} color={avatarColor(m.user_id)} rounded="rounded-full" />
                          <div>
                            <p className="text-sm font-bold">{name}</p>
                            <p className="text-xs text-muted">{ROLE_LABEL[m.role]}</p>
                          </div>
                        </li>
                      );
                    })}
                </ul>
              )}
            </Panel>
            <Panel className="px-5 py-4.5">
              <h2 className="text-base font-bold">O que o status permite</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {org.status === "active"
                  ? "Empresa ativa: cadastra, altera e (nas próximas fases) recebe ou contrata serviços."
                  : "Empresa não ativa: os usuários só consultam dados. Cadastros e alterações ficam travados no banco."}
              </p>
            </Panel>
          </div>
        </div>
      ) : null}

      {tab === "equipe" ? (
        <div className="flex flex-col gap-4">
          <Panel>
            <PanelHeader title="Liberar acesso" description="A pessoa precisa já ter criado a conta com este e-mail." />
            <div className="p-5">
              <AddMemberForm organizationId={org.id} orgType={org.type} />
            </div>
          </Panel>
          <Panel>
            <DataTable minWidth={620}>
              <thead>
                <tr>
                  <Th>Pessoa</Th>
                  <Th>Papel</Th>
                  <Th>Desde</Th>
                  <Th>
                    <span className="sr-only">Ações</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {members.length === 0 ? (
                  <EmptyRow colSpan={4} title="Ninguém tem acesso ainda" />
                ) : (
                  members.map((m) => {
                    const name = names.get(m.user_id) ?? "Usuário";
                    return (
                      <tr key={m.id}>
                        <Td>
                          <span className="flex items-center gap-2.5 font-semibold">
                            <Avatar text={initials(name)} color={avatarColor(m.user_id)} rounded="rounded-full" />
                            {name}
                            {m.user_id === session.userId ? <span className="text-xs font-normal text-muted">(você)</span> : null}
                          </span>
                        </Td>
                        <Td>
                          <Pill tone="blue">{ROLE_LABEL[m.role]}</Pill>
                        </Td>
                        <Td className="text-[#33405F]">{formatDay(m.created_at)}</Td>
                        <Td align="right">
                          {m.user_id !== session.userId ? (
                            <form action={revokeMember.bind(null, org.id, m.id)}>
                              <ConfirmButton message={`Remover o acesso de ${name} a ${org.trade_name}?`} className={btn.small}>
                                Remover
                              </ConfirmButton>
                            </form>
                          ) : null}
                        </Td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </DataTable>
          </Panel>
        </div>
      ) : null}

      {tab === "frota" && isCarrier ? <FleetTab orgId={org.id} /> : null}
      {tab === "motoristas" && isCarrier ? <DriversTab orgId={org.id} /> : null}
      {tab === "historico" ? <HistoryTab orgId={org.id} /> : null}
    </>
  );
}

async function FleetTab({ orgId }: { orgId: string }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("vehicles")
    .select("id, brand, model, model_year, plate, seats, luggage_large, luggage_medium, status, approval_status, category:vehicle_categories(name)")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .returns<VehicleRow[]>();
  const rows = data ?? [];
  return (
    <Panel>
      <DataTable minWidth={760}>
        <thead>
          <tr>
            <Th>Veículo</Th>
            <Th>Placa</Th>
            <Th>Capacidade</Th>
            <Th>Disponibilidade</Th>
            <Th>Aprovação</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <EmptyRow colSpan={5} title="Nenhum veículo cadastrado" />
          ) : (
            rows.map((v) => (
              <tr key={v.id}>
                <Td>
                  <p className="font-semibold">
                    {v.brand} {v.model} · {v.model_year}
                  </p>
                  <p className="text-xs text-muted">{v.category?.name ?? "Sem categoria"}</p>
                </Td>
                <Td className="font-mono">{formatPlate(v.plate)}</Td>
                <Td className="text-[#33405F]">
                  {v.seats} pass. · {v.luggage_large + v.luggage_medium} malas
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
    </Panel>
  );
}

async function DriversTab({ orgId }: { orgId: string }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("drivers")
    .select("id, user_id, full_name, license_category, license_expires_at, languages, status, approval_status")
    .eq("organization_id", orgId)
    .order("full_name")
    .returns<DriverRow[]>();
  const rows = data ?? [];
  const today = new Date();
  return (
    <Panel>
      <DataTable minWidth={820}>
        <thead>
          <tr>
            <Th>Motorista</Th>
            <Th>CNH</Th>
            <Th>Idiomas</Th>
            <Th>App</Th>
            <Th>Aprovação</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <EmptyRow colSpan={5} title="Nenhum motorista cadastrado" />
          ) : (
            rows.map((d) => {
              const license = licenseBadge(d.license_expires_at, today);
              return (
                <tr key={d.id}>
                  <Td>
                    <p className="font-semibold">{d.full_name}</p>
                    <p className="text-xs text-muted">{d.status === "active" ? "Ativo" : "Inativo"}</p>
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
    </Panel>
  );
}

async function HistoryTab({ orgId }: { orgId: string }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("audit_logs")
    .select("*")
    .eq("organization_id", orgId)
    .order("occurred_at", { ascending: false })
    .limit(50)
    .returns<AuditRow[]>();
  const rows = data ?? [];
  const names = await profileNames(supabase, rows.map((r) => r.actor_id));
  return (
    <Panel>
      <PanelHeader
        title="Histórico"
        description="Últimas 50 alterações nesta empresa."
        action={
          <Link href={`/admin/auditoria?empresa=${orgId}`} className="text-[13px] font-semibold text-brand-600 hover:underline">
            Abrir na auditoria
          </Link>
        }
      />
      {rows.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-muted">Nada registrado ainda.</p>
      ) : (
        <ul>
          {rows.map((r) => {
            const who = r.actor_id ? (names.get(r.actor_id) ?? "Usuário") : "Sistema";
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-3 border-b border-[#F1F4F9] px-5 py-3 last:border-0">
                <Avatar text={initials(who)} color={avatarColor(who)} rounded="rounded-full" />
                <p className="min-w-0 flex-1 text-sm">
                  <b>{who}</b> {describeAudit(r)}
                </p>
                <span className="text-xs tabular-nums text-muted">{formatDateTime(r.occurred_at)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
