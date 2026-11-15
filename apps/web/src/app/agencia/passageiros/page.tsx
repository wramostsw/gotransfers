import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell, PageHeader, PageSkeleton } from "@/components/app-shell";
import { PassengerForm } from "@/components/booking-forms";
import { Card, EmptyState, InactiveOrgNotice } from "@/components/ui";
import { orgIsActive, requireArea } from "@/lib/auth";
import { createPassenger } from "@/lib/booking-actions";
import { AGENCY_NAV } from "@/lib/nav";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Passageiros" };

type PassengerRow = { id: string; full_name: string; phone: string | null; email: string | null; notes: string | null };

export default function PassageirosPage() {
  return (
    <AppShell area="Portal da agência" nav={AGENCY_NAV}>
      <PageHeader title="Passageiros" description="Quem vai ser transportado. Guardamos só o necessário para o transfer: nome e contato." />
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
    .from("passengers")
    .select("id, full_name, phone, email, notes")
    .eq("organization_id", membership.organization.id)
    .eq("is_active", true)
    .order("full_name")
    .limit(500)
    .returns<PassengerRow[]>();

  return (
    <div className="flex flex-col gap-6">
      {!orgIsActive(membership) ? (
        <InactiveOrgNotice orgName={membership.organization.tradeName} status={membership.organization.status} />
      ) : canOperate ? (
        <Card>
          <h2 className="mb-4 text-base font-semibold text-ink">Novo passageiro</h2>
          <PassengerForm action={createPassenger} />
        </Card>
      ) : null}

      {error ? (
        <EmptyState title="Não foi possível carregar os passageiros">Tente recarregar a página.</EmptyState>
      ) : !data || data.length === 0 ? (
        <EmptyState title="Nenhum passageiro cadastrado">Cadastre o primeiro passageiro acima para poder criar reservas.</EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((p) => (
            <li key={p.id}>
              <Card className="flex h-full flex-col gap-1">
                <p className="truncate text-base font-semibold text-ink">{p.full_name}</p>
                <p className="truncate text-sm text-muted">{[p.phone, p.email].filter(Boolean).join(" · ") || "Sem contato cadastrado"}</p>
                {p.notes ? <p className="mt-1 text-sm text-[#33405F]">{p.notes}</p> : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
