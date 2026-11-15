import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell, PageHeader, PageSkeleton } from "@/components/app-shell";
import { LocationForm } from "@/components/booking-forms";
import { Badge, Button, Card, EmptyState, InactiveOrgNotice } from "@/components/ui";
import { orgIsActive, requireArea } from "@/lib/auth";
import { createAgencyLocation, setLocationActive } from "@/lib/booking-actions";
import { LOCATION_KIND_LABEL, type LocationKind } from "@/lib/bookings";
import { AGENCY_NAV } from "@/lib/nav";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Locais" };

type LocationRow = {
  id: string;
  organization_id: string | null;
  kind: LocationKind;
  name: string;
  code: string | null;
  address_line: string | null;
  city: string;
  state: string;
  is_active: boolean;
};

export default function LocaisPage() {
  return (
    <AppShell area="Portal da agência" nav={AGENCY_NAV}>
      <PageHeader title="Locais" description="Origens e destinos das suas reservas. Aeroportos e rodoviárias já vêm cadastrados pela GoTransfer; hotéis e endereços você adiciona aqui." />
      <Suspense fallback={<PageSkeleton />}>
        <Content />
      </Suspense>
    </AppShell>
  );
}

async function Content() {
  const { memberships } = await requireArea("agencia");
  const membership = memberships[0];
  const canOperate = orgIsActive(membership) && (membership.role === "agency_admin" || membership.role === "agency_agent");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("locations")
    .select("id, organization_id, kind, name, code, address_line, city, state, is_active")
    .or(`organization_id.is.null,organization_id.eq.${membership.organization.id}`)
    .order("name")
    .limit(500)
    .returns<LocationRow[]>();
  const rows = (data ?? []).filter((l) => l.organization_id || l.is_active);

  return (
    <div className="flex flex-col gap-6">
      {!orgIsActive(membership) ? (
        <InactiveOrgNotice orgName={membership.organization.tradeName} status={membership.organization.status} />
      ) : canOperate ? (
        <Card>
          <h2 className="mb-4 text-base font-semibold text-ink">Novo local da agência</h2>
          <LocationForm action={createAgencyLocation} kinds={["hotel", "address", "other"]} />
        </Card>
      ) : null}

      {error ? (
        <EmptyState title="Não foi possível carregar os locais">Tente recarregar a página.</EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState title="Nenhum local disponível">Cadastre um hotel ou endereço acima.</EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((l) => (
            <li key={l.id}>
              <Card className="flex h-full flex-col gap-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="min-w-0 truncate text-base font-semibold text-ink">
                    {l.name}
                    {l.code ? ` (${l.code})` : ""}
                  </p>
                  <Badge tone={l.organization_id ? "neutral" : "brand"}>{l.organization_id ? "Da agência" : "GoTransfer"}</Badge>
                </div>
                <p className="text-sm text-muted">
                  {LOCATION_KIND_LABEL[l.kind]} · {l.address_line ? `${l.address_line} · ` : ""}
                  {l.city}/{l.state}
                </p>
                {l.organization_id && canOperate ? (
                  <form action={setLocationActive.bind(null, "agencia", l.id, !l.is_active)} className="mt-auto flex items-center gap-2">
                    {l.is_active ? null : <Badge tone="warning">Inativo</Badge>}
                    <Button size="sm" variant="secondary">
                      {l.is_active ? "Desativar" : "Reativar"}
                    </Button>
                  </form>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
