import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell, PageHeader, PageSkeleton } from "@/components/app-shell";
import { Badge, Button, Card, EmptyState } from "@/components/ui";
import { requireOrgRole } from "@/lib/auth";
import {
  APPROVAL_LABEL,
  APPROVAL_TONE,
  DRIVER_STATUS_LABEL,
  LANGUAGE_LABEL,
  licenseBadge,
  type ApprovalStatus,
  type DriverStatus,
} from "@/lib/fleet";
import { CARRIER_NAV } from "@/lib/nav";
import { createClient } from "@/lib/supabase/server";
import { setDriverStatus } from "../actions";
import { CreateDriverForm, LinkDriverButton } from "../forms";

export const metadata: Metadata = { title: "Motoristas" };

type DriverRow = {
  id: string;
  user_id: string | null;
  full_name: string;
  phone: string | null;
  email: string | null;
  license_category: string;
  license_expires_at: string;
  languages: string[];
  status: DriverStatus;
  approval_status: ApprovalStatus;
  rejection_reason: string | null;
};

export default function MotoristasPage() {
  return (
    <AppShell area="Portal da transportadora" nav={CARRIER_NAV}>
      <PageHeader title="Motoristas" description="Quem pode executar serviços. Cada motorista passa por aprovação da GoTransfer." />
      <Suspense fallback={<PageSkeleton />}>
        <Content />
      </Suspense>
    </AppShell>
  );
}

async function Content() {
  const { membership } = await requireOrgRole("transportadora", ["carrier_admin", "carrier_dispatcher"]);
  const isAdmin = membership.role === "carrier_admin";
  const supabase = await createClient();
  const { data: drivers, error } = await supabase
    .from("drivers")
    .select("id, user_id, full_name, phone, email, license_category, license_expires_at, languages, status, approval_status, rejection_reason")
    .eq("organization_id", membership.organization.id)
    .order("full_name")
    .returns<DriverRow[]>();
  const today = new Date();

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <h2 className="mb-4 text-base font-semibold text-ink">Novo motorista · {membership.organization.tradeName}</h2>
        <CreateDriverForm />
      </Card>

      {error ? (
        <EmptyState title="Não foi possível carregar os motoristas">Tente recarregar a página.</EmptyState>
      ) : !drivers || drivers.length === 0 ? (
        <EmptyState title="Nenhum motorista cadastrado">Cadastre o primeiro motorista acima.</EmptyState>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {drivers.map((d) => {
            const license = licenseBadge(d.license_expires_at, today);
            return (
              <li key={d.id}>
                <Card className="flex h-full flex-col gap-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-ink">{d.full_name}</p>
                      <p className="truncate text-sm text-muted">{[d.phone, d.email].filter(Boolean).join(" · ") || "Sem contato"}</p>
                    </div>
                    <Badge tone={APPROVAL_TONE[d.approval_status]}>{APPROVAL_LABEL[d.approval_status]}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge>CNH {d.license_category}</Badge>
                    <Badge tone={license.tone}>{license.text}</Badge>
                    {d.languages.map((code) => (
                      <Badge key={code} tone="brand">{LANGUAGE_LABEL[code] ?? code}</Badge>
                    ))}
                    <Badge tone={d.status === "active" ? "success" : "warning"}>{DRIVER_STATUS_LABEL[d.status]}</Badge>
                    {d.user_id ? <Badge tone="success">App liberado</Badge> : null}
                  </div>
                  {d.approval_status === "rejected" && d.rejection_reason ? (
                    <p className="rounded-xl bg-danger-50 px-3 py-2 text-sm text-danger-700">Motivo: {d.rejection_reason}</p>
                  ) : null}
                  <div className="mt-auto flex flex-wrap items-start gap-2">
                    <form action={setDriverStatus.bind(null, d.id, d.status === "active" ? "inactive" : "active")}>
                      <Button size="sm" variant="secondary">{d.status === "active" ? "Desativar" : "Reativar"}</Button>
                    </form>
                    {isAdmin && !d.user_id ? <LinkDriverButton driverId={d.id} /> : null}
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
