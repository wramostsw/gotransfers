import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell, PageHeader, PageSkeleton } from "@/components/app-shell";
import { Badge, Button, Card, EmptyState } from "@/components/ui";
import { requireOrgRole } from "@/lib/auth";
import {
  APPROVAL_LABEL,
  APPROVAL_TONE,
  VEHICLE_STATUS_LABEL,
  formatPlate,
  type ApprovalStatus,
  type VehicleStatus,
} from "@/lib/fleet";
import { CARRIER_NAV } from "@/lib/nav";
import { createClient } from "@/lib/supabase/server";
import { setVehicleStatus } from "../actions";
import { CreateVehicleForm } from "../forms";

export const metadata: Metadata = { title: "Veículos" };

type VehicleRow = {
  id: string;
  brand: string;
  model: string;
  model_year: number;
  plate: string;
  color: string | null;
  seats: number;
  luggage_large: number;
  luggage_medium: number;
  is_accessible: boolean;
  has_child_seat: boolean;
  status: VehicleStatus;
  approval_status: ApprovalStatus;
  rejection_reason: string | null;
  category: { name: string } | null;
};

const NEXT_STATUS: Record<VehicleStatus, Array<{ status: VehicleStatus; label: string }>> = {
  available: [
    { status: "maintenance", label: "Pôr em manutenção" },
    { status: "unavailable", label: "Marcar indisponível" },
  ],
  maintenance: [{ status: "available", label: "Marcar disponível" }],
  unavailable: [{ status: "available", label: "Marcar disponível" }],
};

export default function VeiculosPage() {
  return (
    <AppShell area="Portal da transportadora" nav={CARRIER_NAV}>
      <PageHeader title="Veículos" description="A frota que pode receber serviços. Cada veículo passa por aprovação da GoTransfer." />
      <Suspense fallback={<PageSkeleton />}>
        <Content />
      </Suspense>
    </AppShell>
  );
}

async function Content() {
  const { membership } = await requireOrgRole("transportadora", ["carrier_admin", "carrier_dispatcher"]);
  const supabase = await createClient();
  const [{ data: categories }, { data: vehicles, error }] = await Promise.all([
    supabase
      .from("vehicle_categories")
      .select("id, name, typical_seats")
      .eq("is_active", true)
      .order("sort_order")
      .returns<Array<{ id: string; name: string; typical_seats: number }>>(),
    supabase
      .from("vehicles")
      .select(
        "id, brand, model, model_year, plate, color, seats, luggage_large, luggage_medium, is_accessible, has_child_seat, status, approval_status, rejection_reason, category:vehicle_categories(name)",
      )
      .eq("organization_id", membership.organization.id)
      .order("created_at", { ascending: false })
      .returns<VehicleRow[]>(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <h2 className="mb-4 text-base font-semibold text-ink">Novo veículo · {membership.organization.tradeName}</h2>
        <CreateVehicleForm categories={categories ?? []} />
      </Card>

      {error ? (
        <EmptyState title="Não foi possível carregar os veículos">Tente recarregar a página.</EmptyState>
      ) : !vehicles || vehicles.length === 0 ? (
        <EmptyState title="Nenhum veículo cadastrado">Cadastre o primeiro veículo da frota acima.</EmptyState>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {vehicles.map((v) => (
            <li key={v.id}>
              <Card className="flex h-full flex-col gap-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-ink">
                      {v.brand} {v.model} · {v.model_year}
                    </p>
                    <p className="text-sm text-muted">
                      {v.category?.name ?? "Sem categoria"} · <span className="font-mono text-ink">{formatPlate(v.plate)}</span>
                      {v.color ? ` · ${v.color}` : ""}
                    </p>
                  </div>
                  <Badge tone={APPROVAL_TONE[v.approval_status]}>{APPROVAL_LABEL[v.approval_status]}</Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge>{v.seats} passageiros</Badge>
                  <Badge>{v.luggage_large} malas grandes</Badge>
                  <Badge>{v.luggage_medium} malas médias</Badge>
                  {v.is_accessible ? <Badge tone="brand">Acessível</Badge> : null}
                  {v.has_child_seat ? <Badge tone="brand">Cadeirinha</Badge> : null}
                  <Badge tone={v.status === "available" ? "success" : "warning"}>{VEHICLE_STATUS_LABEL[v.status]}</Badge>
                </div>
                {v.approval_status === "rejected" && v.rejection_reason ? (
                  <p className="rounded-xl bg-danger-50 px-3 py-2 text-sm text-danger-700">Motivo: {v.rejection_reason}</p>
                ) : null}
                <div className="mt-auto flex flex-wrap gap-2">
                  {NEXT_STATUS[v.status].map((next) => (
                    <form key={next.status} action={setVehicleStatus.bind(null, v.id, next.status)}>
                      <Button size="sm" variant="secondary">{next.label}</Button>
                    </form>
                  ))}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
