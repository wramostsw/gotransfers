import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell, PageHeader, PageSkeleton } from "@/components/app-shell";
import { Badge, Card, EmptyState } from "@/components/ui";
import { requireArea } from "@/lib/auth";
import { LANGUAGE_LABEL, formatPlate, licenseBadge } from "@/lib/fleet";
import { ADMIN_NAV } from "@/lib/nav";
import { createClient } from "@/lib/supabase/server";
import { ReviewForm } from "./review-form";

export const metadata: Metadata = { title: "Aprovações" };

type Org = { trade_name: string; status: string } | null;

type PendingVehicle = {
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
  category: { name: string } | null;
  organization: Org;
};

type PendingDriver = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  license_number: string;
  license_category: string;
  license_expires_at: string;
  languages: string[];
  organization: Org;
};

export default function AprovacoesPage() {
  return (
    <AppShell area="Admin Master" nav={ADMIN_NAV}>
      <PageHeader
        title="Aprovações"
        description="Veículos e motoristas aguardando análise. Só cadastros aprovados poderão receber serviços."
      />
      <Suspense fallback={<PageSkeleton />}>
        <Queue />
      </Suspense>
    </AppShell>
  );
}

async function Queue() {
  await requireArea("admin");
  const supabase = await createClient();
  const [{ data: vehicles }, { data: drivers }] = await Promise.all([
    supabase
      .from("vehicles")
      .select(
        "id, brand, model, model_year, plate, color, seats, luggage_large, luggage_medium, is_accessible, has_child_seat, category:vehicle_categories(name), organization:organizations(trade_name, status)",
      )
      .eq("approval_status", "pending")
      .order("created_at")
      .limit(100)
      .returns<PendingVehicle[]>(),
    supabase
      .from("drivers")
      .select(
        "id, full_name, phone, email, license_number, license_category, license_expires_at, languages, organization:organizations(trade_name, status)",
      )
      .eq("approval_status", "pending")
      .order("created_at")
      .limit(100)
      .returns<PendingDriver[]>(),
  ]);
  const today = new Date();

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-ink">Motoristas ({drivers?.length ?? 0})</h2>
        {!drivers || drivers.length === 0 ? (
          <EmptyState title="Nenhum motorista aguardando análise" />
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {drivers.map((d) => {
              const license = licenseBadge(d.license_expires_at, today);
              return (
                <li key={d.id}>
                  <Card className="flex h-full flex-col gap-3">
                    <div>
                      <p className="text-base font-semibold text-ink">{d.full_name}</p>
                      <p className="text-sm text-muted">
                        {d.organization?.trade_name ?? "Sem organização"}
                        {d.organization && d.organization.status !== "active" ? " · organização não ativa" : ""}
                      </p>
                      <p className="text-sm text-muted">{[d.phone, d.email].filter(Boolean).join(" · ")}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge>CNH {d.license_number} · categoria {d.license_category}</Badge>
                      <Badge tone={license.tone}>{license.text}</Badge>
                      {d.languages.map((code) => (
                        <Badge key={code} tone="brand">{LANGUAGE_LABEL[code] ?? code}</Badge>
                      ))}
                    </div>
                    <div className="mt-auto">
                      <ReviewForm entity="driver" id={d.id} />
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-ink">Veículos ({vehicles?.length ?? 0})</h2>
        {!vehicles || vehicles.length === 0 ? (
          <EmptyState title="Nenhum veículo aguardando análise" />
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {vehicles.map((v) => (
              <li key={v.id}>
                <Card className="flex h-full flex-col gap-3">
                  <div>
                    <p className="text-base font-semibold text-ink">
                      {v.brand} {v.model} · {v.model_year}
                    </p>
                    <p className="text-sm text-muted">
                      {v.organization?.trade_name ?? "Sem organização"} · {v.category?.name} ·{" "}
                      <span className="font-mono text-ink">{formatPlate(v.plate)}</span>
                      {v.color ? ` · ${v.color}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge>{v.seats} passageiros</Badge>
                    <Badge>{v.luggage_large} malas grandes</Badge>
                    <Badge>{v.luggage_medium} malas médias</Badge>
                    {v.is_accessible ? <Badge tone="brand">Acessível</Badge> : null}
                    {v.has_child_seat ? <Badge tone="brand">Cadeirinha</Badge> : null}
                  </div>
                  <div className="mt-auto">
                    <ReviewForm entity="vehicle" id={v.id} />
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
