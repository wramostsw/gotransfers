import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AppShell, PageHeader, PageSkeleton } from "@/components/app-shell";
import { NewBookingForm } from "@/components/booking-forms";
import { Card, EmptyState, InactiveOrgNotice, buttonClass } from "@/components/ui";
import { orgIsActive, requireOrgRole } from "@/lib/auth";
import { createBooking } from "@/lib/booking-actions";
import { LOCATION_KIND_LABEL, type LocationKind } from "@/lib/bookings";
import { AGENCY_NAV } from "@/lib/nav";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Nova reserva" };

export default function NovaReservaPage() {
  return (
    <AppShell area="Portal da agência" nav={AGENCY_NAV}>
      <PageHeader title="Nova reserva" description="Informe o passageiro e os trechos. Ida e volta são trechos independentes da mesma reserva." />
      <Suspense fallback={<PageSkeleton />}>
        <Content />
      </Suspense>
    </AppShell>
  );
}

async function Content() {
  const { membership } = await requireOrgRole("agencia", ["agency_admin", "agency_agent"]);
  if (!orgIsActive(membership)) return <InactiveOrgNotice orgName={membership.organization.tradeName} status={membership.organization.status} />;

  const supabase = await createClient();
  const [passengers, locations, categories] = await Promise.all([
    supabase
      .from("passengers")
      .select("id, full_name")
      .eq("organization_id", membership.organization.id)
      .eq("is_active", true)
      .order("full_name")
      .returns<Array<{ id: string; full_name: string }>>(),
    supabase
      .from("locations")
      .select("id, name, kind, city, organization_id")
      .eq("is_active", true)
      .or(`organization_id.is.null,organization_id.eq.${membership.organization.id}`)
      .order("name")
      .returns<Array<{ id: string; name: string; kind: LocationKind; city: string; organization_id: string | null }>>(),
    supabase
      .from("vehicle_categories")
      .select("id, name, typical_seats")
      .eq("is_active", true)
      .order("sort_order")
      .returns<Array<{ id: string; name: string; typical_seats: number }>>(),
  ]);

  if ((passengers.data ?? []).length === 0) {
    return (
      <EmptyState title="Cadastre um passageiro primeiro">
        Toda reserva pertence a um passageiro.{" "}
        <Link href="/agencia/passageiros" className="font-semibold text-brand-800 underline">
          Cadastrar passageiro
        </Link>
      </EmptyState>
    );
  }
  if ((locations.data ?? []).length < 2) {
    return (
      <EmptyState title="Faltam locais para montar o trajeto">
        É preciso ter pelo menos origem e destino cadastrados.{" "}
        <Link href="/agencia/locais" className="font-semibold text-brand-800 underline">
          Cadastrar local
        </Link>
      </EmptyState>
    );
  }

  return (
    <Card>
      <NewBookingForm
        action={createBooking}
        passengers={(passengers.data ?? []).map((p) => ({ id: p.id, label: p.full_name }))}
        locations={(locations.data ?? []).map((l) => ({ id: l.id, label: `${l.name} · ${LOCATION_KIND_LABEL[l.kind]} · ${l.city}` }))}
        categories={(categories.data ?? []).map((c) => ({ id: c.id, label: `${c.name} · até ${c.typical_seats} passageiros` }))}
      />
      <p className="mt-5 border-t border-line pt-4 text-sm text-muted">
        Não achou o hotel ou endereço?{" "}
        <Link href="/agencia/locais" className={buttonClass("ghost", "sm")}>
          Cadastrar novo local
        </Link>
      </p>
    </Card>
  );
}
