import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AdminHeader, AdminSkeleton, Avatar, Panel, PanelHeader, Pill, avatarColor, btn, initials } from "@/components/admin/kit";
import { profileNames, timeAgo, isoDate } from "@/lib/admin-data";
import { describeAudit, type AuditRow } from "@/lib/audit";
import { requireArea } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Painel · Admin" };

export default function AdminPage() {
  return (
    <Suspense fallback={<AdminSkeleton />}>
      <Dashboard />
    </Suspense>
  );
}

type OrgLite = { type: "agency" | "transport_company" | "platform"; status: string; created_at: string; is_individual: boolean };

async function Dashboard() {
  await requireArea("admin");
  const supabase = await createClient();
  const now = new Date();
  const today = isoDate(now);
  const in30 = isoDate(new Date(now.getTime() + 30 * 86_400_000));

  const head = { count: "exact" as const, head: true };
  const n = (r: { count: number | null }) => r.count ?? 0;

  const [orgsRes, dApproved, dPending, vApproved, vPending, vAvailable, cnhExpiredRes, cnhExpiringRes, cnhTotalRes, auditRes] = await Promise.all([
    supabase.from("organizations").select("type, status, created_at, is_individual").neq("type", "platform").returns<OrgLite[]>(),
    supabase.from("drivers").select("id", head).eq("approval_status", "approved"),
    supabase.from("drivers").select("id", head).eq("approval_status", "pending"),
    supabase.from("vehicles").select("id", head).eq("approval_status", "approved"),
    supabase.from("vehicles").select("id", head).eq("approval_status", "pending"),
    supabase.from("vehicles").select("id", head).eq("approval_status", "approved").eq("status", "available"),
    supabase.from("drivers").select("id", head).eq("status", "active").lt("license_expires_at", today),
    supabase.from("drivers").select("id", head).eq("status", "active").gte("license_expires_at", today).lte("license_expires_at", in30),
    supabase.from("drivers").select("id", head).eq("status", "active"),
    supabase.from("audit_logs").select("*").order("occurred_at", { ascending: false }).limit(6).returns<AuditRow[]>(),
  ]);
  const driversApproved = n(dApproved);
  const driversPending = n(dPending);
  const vehiclesApproved = n(vApproved);
  const vehiclesPending = n(vPending);
  const vehiclesAvailable = n(vAvailable);
  const cnhExpired = n(cnhExpiredRes);
  const cnhExpiring = n(cnhExpiringRes);
  const cnhTotal = n(cnhTotalRes);

  const orgs = orgsRes.data ?? [];
  const activeAgencies = orgs.filter((o) => o.type === "agency" && o.status === "active").length;
  const activeCarriers = orgs.filter((o) => o.type === "transport_company" && o.status === "active").length;
  const pendingOrgs = orgs.filter((o) => o.status === "pending").length;
  const inactiveOrgs = orgs.filter((o) => o.status === "suspended" || o.status === "blocked").length;
  const newAgenciesMonth = orgs.filter((o) => o.type === "agency" && o.created_at >= isoDate(new Date(now.getFullYear(), now.getMonth(), 1))).length;

  const audit = auditRes.data ?? [];
  const names = await profileNames(supabase, audit.map((a) => a.actor_id));

  const actions: Array<{ tone: "red" | "amber" | "blue"; title: string; detail: string; href: string }> = [];
  if (cnhExpired) actions.push({ tone: "red", title: `${cnhExpired} ${cnhExpired === 1 ? "motorista com CNH vencida" : "motoristas com CNH vencida"}`, detail: "Não podem receber serviços até atualizar o documento", href: "/admin/motoristas?cnh=vencida" });
  if (driversPending + vehiclesPending) actions.push({ tone: "amber", title: `${driversPending + vehiclesPending} cadastros aguardando aprovação`, detail: `${driversPending} motoristas e ${vehiclesPending} veículos`, href: "/admin/aprovacoes" });
  if (pendingOrgs) actions.push({ tone: "amber", title: `${pendingOrgs} ${pendingOrgs === 1 ? "empresa em análise" : "empresas em análise"}`, detail: "Aprove para liberar cadastros e serviços", href: "/admin/organizacoes?status=pending" });
  if (cnhExpiring) actions.push({ tone: "blue", title: `${cnhExpiring} CNH vencem em até 30 dias`, detail: "Avise as transportadoras com antecedência", href: "/admin/motoristas?cnh=vencendo" });
  if (inactiveOrgs) actions.push({ tone: "blue", title: `${inactiveOrgs} ${inactiveOrgs === 1 ? "empresa suspensa ou bloqueada" : "empresas suspensas ou bloqueadas"}`, detail: "Só consultam dados; revise se algo mudou", href: "/admin/organizacoes?status=suspended" });

  const okCnh = Math.max(0, cnhTotal - cnhExpired - cnhExpiring);
  const pct = (n: number) => (cnhTotal ? Math.round((n / cnhTotal) * 100) : 0);

  // Organizações ativas acumuladas por mês (últimos 6 meses), por data de cadastro.
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i + 1, 1);
    const label = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
    const until = isoDate(d);
    return {
      label: label.charAt(0).toUpperCase() + label.slice(1),
      agencies: orgs.filter((o) => o.type === "agency" && o.created_at < until).length,
      carriers: orgs.filter((o) => o.type === "transport_company" && o.created_at < until).length,
    };
  });
  const maxBar = Math.max(1, ...months.flatMap((m) => [m.agencies, m.carriers]));

  const kpis = [
    { label: "Agências ativas", value: activeAgencies, note: `${newAgenciesMonth} cadastradas este mês`, tone: "green" as const },
    { label: "Transportadoras ativas", value: activeCarriers, note: `${pendingOrgs} empresas em análise`, tone: pendingOrgs ? ("amber" as const) : ("green" as const) },
    { label: "Motoristas aprovados", value: driversApproved, note: `${driversPending} aguardando aprovação`, tone: driversPending ? ("amber" as const) : ("green" as const) },
    { label: "Veículos aprovados", value: vehiclesApproved, note: `${vehiclesAvailable} disponíveis agora`, tone: "green" as const },
  ];

  return (
    <>
      <AdminHeader
        title="Painel"
        description="Visão geral do marketplace. Os indicadores de serviços e faturamento entram com o motor de reservas (Fases 3 e 4)."
        actions={
          <Link href="/admin/organizacoes/nova" className={btn.primary}>
            Nova organização
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => (
          <Panel key={k.label} className="flex flex-col gap-2.5 px-5 py-4.5">
            <p className="text-[13px] font-semibold text-muted">{k.label}</p>
            <p className="font-display text-[32px] font-extrabold tabular-nums tracking-tight">{k.value}</p>
            <p className="text-[13px] text-muted">
              <Pill tone={k.tone}>{k.note}</Pill>
            </p>
          </Panel>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <PanelHeader title="Requer sua ação" action={<Pill tone={actions.length ? "orange" : "green"}>{actions.length ? `${actions.length} pendências` : "Tudo em dia"}</Pill>} />
          {actions.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted">Nenhuma pendência agora. Novos cadastros e vencimentos aparecem aqui.</p>
          ) : (
            <ul>
              {actions.map((a) => (
                <li key={a.title} className="flex flex-wrap items-center gap-3.5 border-b border-[#F1F4F9] px-5 py-3.5 last:border-0">
                  <span aria-hidden className={`size-2.5 shrink-0 rounded-full ${a.tone === "red" ? "bg-danger-700" : a.tone === "amber" ? "bg-[#E0A100]" : "bg-brand-600"}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{a.title}</p>
                    <p className="mt-0.5 text-[13px] text-muted">{a.detail}</p>
                  </div>
                  <Pill tone={a.tone}>{a.tone === "red" ? "Urgente" : a.tone === "amber" ? "Atenção" : "Rotina"}</Pill>
                  <Link href={a.href} className={btn.small}>
                    Resolver
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel className="flex flex-col gap-4 px-5 py-4.5">
          <h2 className="text-base font-bold">CNH dos motoristas ativos</h2>
          {cnhTotal === 0 ? (
            <p className="text-sm text-muted">Nenhum motorista ativo cadastrado ainda.</p>
          ) : (
            <>
              <p className="font-display text-3xl font-extrabold">
                {pct(okCnh)}% <span className="font-sans text-sm font-medium text-muted">em dia</span>
              </p>
              <div
                role="img"
                aria-label={`${okCnh} em dia, ${cnhExpiring} vencem em 30 dias, ${cnhExpired} vencidas`}
                className="flex h-3 overflow-hidden rounded-full bg-[#EEF1F7]"
              >
                <span className="bg-success-700" style={{ width: `${pct(okCnh)}%` }} />
                <span className="bg-[#E0A100]" style={{ width: `${pct(cnhExpiring)}%` }} />
                <span className="bg-danger-700" style={{ width: `${pct(cnhExpired)}%` }} />
              </div>
              <dl className="flex flex-col gap-2.5 text-[13px]">
                {[
                  ["Em dia", okCnh, "bg-success-700"],
                  ["Vencem em até 30 dias", cnhExpiring, "bg-[#E0A100]"],
                  ["Vencidas (bloqueiam serviços)", cnhExpired, "bg-danger-700"],
                ].map(([label, value, color]) => (
                  <div key={label as string} className="flex items-center gap-2">
                    <span aria-hidden className={`size-2.5 rounded-[3px] ${color}`} />
                    <dt className="flex-1">{label}</dt>
                    <dd className="font-bold tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
          <Link href="/admin/motoristas" className="mt-auto text-sm font-semibold text-brand-600 hover:underline">
            Ver motoristas
          </Link>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel className="flex flex-col gap-4 px-5 py-4.5 xl:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-bold">Crescimento da rede</h2>
            <div className="flex gap-4 text-[13px] text-muted">
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="size-2.5 rounded-[3px] bg-brand-600" />
                Agências
              </span>
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="size-2.5 rounded-[3px] bg-[#F0A06A]" />
                Transportadoras
              </span>
            </div>
          </div>
          <div
            role="img"
            aria-label={`Organizações cadastradas acumuladas: ${months.map((m) => `${m.label} ${m.agencies} agências e ${m.carriers} transportadoras`).join("; ")}`}
            className="grid h-48 grid-cols-6 items-end gap-3.5 border-b border-line pb-1"
          >
            {months.map((m) => (
              <div key={m.label} className="flex flex-col items-center gap-2">
                <div className="flex h-40 items-end gap-1.5">
                  <span className="w-5 rounded-t-md bg-brand-600" style={{ height: `${Math.max(2, (m.agencies / maxBar) * 150)}px` }} />
                  <span className="w-5 rounded-t-md bg-[#F0A06A]" style={{ height: `${Math.max(2, (m.carriers / maxBar) * 150)}px` }} />
                </div>
                <span className="text-xs text-muted">{m.label}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="Atividade recente"
            action={
              <Link href="/admin/auditoria" className="text-[13px] font-semibold text-brand-600 hover:underline">
                Ver auditoria
              </Link>
            }
          />
          {audit.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted">Nada registrado ainda.</p>
          ) : (
            <ul>
              {audit.map((a) => {
                const who = a.actor_id ? (names.get(a.actor_id) ?? "Usuário") : "Sistema";
                return (
                  <li key={a.id} className="flex gap-3 border-b border-[#F1F4F9] px-5 py-3 last:border-0">
                    <Avatar text={initials(who)} color={avatarColor(who)} rounded="rounded-full" />
                    <div className="min-w-0">
                      <p className="text-[13px] leading-snug">
                        <b>{who}</b> {describeAudit(a)}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">{timeAgo(a.occurred_at, now)}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
