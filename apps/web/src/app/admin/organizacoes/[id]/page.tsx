import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AppShell, PageSkeleton } from "@/components/app-shell";
import { Badge, Button, Card, EmptyState } from "@/components/ui";
import { requireArea } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  ORG_STATUS_LABEL,
  ORG_TYPE_LABEL,
  ROLE_LABEL,
  type MemberRole,
  type OrgStatus,
  type OrgType,
} from "@/lib/roles";
import { revokeMember, setOrganizationStatus } from "../../actions";
import { AddMemberForm } from "../../admin-forms";
import { ADMIN_NAV } from "@/lib/nav";

export const metadata: Metadata = { title: "Organização" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const STATUS_TONE: Record<OrgStatus, "success" | "warning" | "danger"> = {
  active: "success",
  pending: "warning",
  suspended: "danger",
  blocked: "danger",
};

type Org = {
  id: string;
  type: OrgType;
  trade_name: string;
  legal_name: string;
  tax_id: string | null;
  is_individual: boolean;
  status: OrgStatus;
};
type MemberRow = { id: string; user_id: string; role: MemberRole; status: "active" | "revoked" };
type ProfileRow = { id: string; full_name: string; email: string | null };

export default function OrganizacaoPage({ params }: PageProps<"/admin/organizacoes/[id]">) {
  return (
    <AppShell area="Admin Master" nav={ADMIN_NAV}>
      <Link href="/admin/organizacoes" className="mb-4 inline-block text-sm font-semibold text-brand-800 hover:underline">
        ← Organizações
      </Link>
      <Suspense fallback={<PageSkeleton />}>
        <Detail params={params} />
      </Suspense>
    </AppShell>
  );
}

async function Detail({ params }: { params: Promise<{ id: string }> }) {
  const { session } = await requireArea("admin");
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const supabase = await createClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("id, type, trade_name, legal_name, tax_id, is_individual, status")
    .eq("id", id)
    .maybeSingle<Org>();
  if (!org) notFound();

  const { data: memberRows } = await supabase
    .from("memberships")
    .select("id, user_id, role, status")
    .eq("organization_id", id)
    .eq("status", "active")
    .order("created_at")
    .returns<MemberRow[]>();
  const members = memberRows ?? [];
  const { data: profileRows } = members.length
    ? await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", [...new Set(members.map((m) => m.user_id))])
        .returns<ProfileRow[]>()
    : { data: [] as ProfileRow[] };
  const profiles = new Map((profileRows ?? []).map((p) => [p.id, p]));
  const isPlatform = org.type === "platform";

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-ink">{org.trade_name}</h1>
            <p className="mt-1 text-sm text-muted">
              {org.is_individual ? "Motorista autônomo" : ORG_TYPE_LABEL[org.type]} · {org.legal_name}
              {org.tax_id ? ` · ${org.tax_id}` : ""}
            </p>
          </div>
          <Badge tone={STATUS_TONE[org.status]}>{ORG_STATUS_LABEL[org.status]}</Badge>
        </div>
        {!isPlatform ? (
          <div className="mt-5 flex flex-wrap gap-2">
            {org.status !== "active" ? (
              <form action={setOrganizationStatus.bind(null, org.id, "active")}>
                <Button size="sm">{org.status === "pending" ? "Aprovar" : "Reativar"}</Button>
              </form>
            ) : null}
            {org.status === "active" ? (
              <form action={setOrganizationStatus.bind(null, org.id, "suspended")}>
                <Button size="sm" variant="danger">Suspender</Button>
              </form>
            ) : null}
            {org.status !== "blocked" ? (
              <form action={setOrganizationStatus.bind(null, org.id, "blocked")}>
                <Button size="sm" variant="danger">Bloquear</Button>
              </form>
            ) : null}
          </div>
        ) : null}
      </Card>

      <Card>
        <h2 className="mb-1 text-base font-semibold text-ink">Liberar acesso</h2>
        <p className="mb-4 text-sm text-muted">A pessoa precisa já ter criado a conta com este e-mail.</p>
        <AddMemberForm organizationId={org.id} orgType={org.type} />
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-ink">Pessoas com acesso</h2>
        {members.length === 0 ? (
          <EmptyState title="Ninguém tem acesso ainda">Libere o acesso do administrador da organização acima.</EmptyState>
        ) : (
          <ul className="flex flex-col gap-3">
            {members.map((m) => {
              const profile = profiles.get(m.user_id);
              return (
                <li key={m.id}>
                  <Card className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-ink">{profile?.full_name || profile?.email || "Usuário"}</p>
                      <p className="truncate text-sm text-muted">{profile?.email}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge tone="brand">{ROLE_LABEL[m.role]}</Badge>
                      {m.user_id !== session.userId ? (
                        <form action={revokeMember.bind(null, org.id, m.id)}>
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
      </section>
    </div>
  );
}
