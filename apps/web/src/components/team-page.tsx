import { Suspense } from "react";
import { AppShell, PageHeader, PageSkeleton, type NavItem } from "@/components/app-shell";
import { AddTeamMemberForm } from "@/components/team-form";
import { Badge, Button, Card, EmptyState } from "@/components/ui";
import { requireOrgRole } from "@/lib/auth";
import { ROLES_BY_ORG_TYPE, ROLE_LABEL, type MemberRole } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { removeTeamMember, type TeamArea } from "@/lib/team-actions";

type MemberRow = { id: string; user_id: string; role: MemberRole };
type ProfileRow = { id: string; full_name: string; email: string | null };

const ADMIN_ROLE: Record<TeamArea, MemberRole> = { agencia: "agency_admin", transportadora: "carrier_admin" };

/** Equipe da agência ou da transportadora: o administrador libera e remove acessos. */
export function TeamPage({ area, areaTitle, nav }: { area: TeamArea; areaTitle: string; nav: NavItem[] }) {
  return (
    <AppShell area={areaTitle} nav={nav}>
      <PageHeader title="Equipe" description="Quem tem acesso a esta empresa no GoTransfer e com qual papel." />
      <Suspense fallback={<PageSkeleton />}>
        <Content area={area} />
      </Suspense>
    </AppShell>
  );
}

async function Content({ area }: { area: TeamArea }) {
  const { session, membership } = await requireOrgRole(area, [ADMIN_ROLE[area]]);
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("memberships")
    .select("id, user_id, role")
    .eq("organization_id", membership.organization.id)
    .eq("status", "active")
    .order("created_at")
    .returns<MemberRow[]>();
  const members = rows ?? [];
  const { data: profileRows } = members.length
    ? await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", [...new Set(members.map((m) => m.user_id))])
        .returns<ProfileRow[]>()
    : { data: [] as ProfileRow[] };
  const profiles = new Map((profileRows ?? []).map((p) => [p.id, p]));
  const roles = ROLES_BY_ORG_TYPE[membership.organization.type].filter((r) => r !== "driver");

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <h2 className="mb-1 text-base font-semibold text-ink">Liberar acesso · {membership.organization.tradeName}</h2>
        <p className="mb-4 text-sm text-muted">
          A pessoa precisa já ter criado a conta no app com este e-mail.
          {area === "transportadora" ? " Motoristas são liberados na tela de Motoristas." : ""}
        </p>
        <AddTeamMemberForm area={area} roles={roles} />
      </Card>

      {members.length === 0 ? (
        <EmptyState title="Ninguém tem acesso ainda" />
      ) : (
        <ul className="flex flex-col gap-3">
          {members.map((m) => {
            const profile = profiles.get(m.user_id);
            return (
              <li key={m.id}>
                <Card className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-ink">
                      {profile?.full_name || profile?.email || "Usuário"}
                      {m.user_id === session.userId ? " (você)" : ""}
                    </p>
                    <p className="truncate text-sm text-muted">{profile?.email}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge tone="brand">{ROLE_LABEL[m.role]}</Badge>
                    {m.user_id !== session.userId ? (
                      <form action={removeTeamMember.bind(null, area, m.id)}>
                        <Button size="sm" variant="danger">Remover</Button>
                      </form>
                    ) : null}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
