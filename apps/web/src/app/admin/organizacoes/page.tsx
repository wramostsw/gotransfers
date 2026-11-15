import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AppShell, PageHeader, PageSkeleton } from "@/components/app-shell";
import { Badge, Card, EmptyState } from "@/components/ui";
import { requireArea } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ORG_STATUS_LABEL, ORG_TYPE_LABEL, type OrgStatus, type OrgType } from "@/lib/roles";
import { CreateOrganizationForm } from "../admin-forms";
import { ADMIN_NAV } from "@/lib/nav";

export const metadata: Metadata = { title: "Organizações" };

type OrgRow = {
  id: string;
  type: OrgType;
  trade_name: string;
  legal_name: string;
  tax_id: string | null;
  is_individual: boolean;
  status: OrgStatus;
};

const STATUS_TONE: Record<OrgStatus, "success" | "warning" | "danger"> = {
  active: "success",
  pending: "warning",
  suspended: "danger",
  blocked: "danger",
};

export default function OrganizacoesPage() {
  return (
    <AppShell area="Admin Master" nav={ADMIN_NAV}>
      <PageHeader title="Organizações" description="Agências, transportadoras e motoristas autônomos do marketplace." />
      <div className="flex flex-col gap-6">
        <Card>
          <h2 className="mb-4 text-base font-semibold text-ink">Nova organização</h2>
          <CreateOrganizationForm />
        </Card>
        <Suspense fallback={<PageSkeleton />}>
          <OrganizationList />
        </Suspense>
      </div>
    </AppShell>
  );
}

async function OrganizationList() {
  await requireArea("admin");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("id, type, trade_name, legal_name, tax_id, is_individual, status")
    .neq("type", "platform")
    .order("created_at", { ascending: false })
    .limit(200)
    .returns<OrgRow[]>();

  if (error) {
    return <EmptyState title="Não foi possível carregar as organizações">Tente recarregar a página.</EmptyState>;
  }
  if (!data || data.length === 0) {
    return <EmptyState title="Nenhuma organização cadastrada">Cadastre a primeira agência ou transportadora acima.</EmptyState>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {data.map((org) => (
        <li key={org.id}>
          <Link href={`/admin/organizacoes/${org.id}`} className="group block rounded-(--radius-card)">
            <Card className="flex flex-wrap items-center justify-between gap-3 transition-colors group-hover:border-brand-600">
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-ink">{org.trade_name}</p>
                <p className="truncate text-sm text-muted">
                  {org.is_individual ? "Motorista autônomo" : ORG_TYPE_LABEL[org.type]}
                  {org.tax_id ? ` · ${org.tax_id}` : ""}
                </p>
              </div>
              <Badge tone={STATUS_TONE[org.status]}>{ORG_STATUS_LABEL[org.status]}</Badge>
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  );
}
