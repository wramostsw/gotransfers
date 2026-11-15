import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AppShell, PageHeader, PageSkeleton } from "@/components/app-shell";
import { Card } from "@/components/ui";
import { requireArea } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_NAV } from "@/lib/nav";

export const metadata: Metadata = { title: "Admin Master" };

export default function AdminPage() {
  return (
    <AppShell area="Admin Master" nav={ADMIN_NAV}>
      <PageHeader title="Painel" description="Visão geral do marketplace." />
      <Suspense fallback={<PageSkeleton />}>
        <Overview />
      </Suspense>
    </AppShell>
  );
}

async function Overview() {
  await requireArea("admin");
  const supabase = await createClient();
  const count = async (filter: { type?: string; status?: string }) => {
    let query = supabase.from("organizations").select("id", { count: "exact", head: true });
    if (filter.type) query = query.eq("type", filter.type);
    if (filter.status) query = query.eq("status", filter.status).neq("type", "platform");
    const { count: total } = await query;
    return total ?? 0;
  };
  const [agencies, carriers, pending] = await Promise.all([
    count({ type: "agency" }),
    count({ type: "transport_company" }),
    count({ status: "pending" }),
  ]);

  const stats = [
    { label: "Agências", value: agencies },
    { label: "Transportadoras e autônomos", value: carriers },
    { label: "Cadastros em análise", value: pending },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <Card key={s.label}>
            <p className="text-3xl font-bold tabular-nums text-ink">{s.value}</p>
            <p className="mt-1 text-sm text-muted">{s.label}</p>
          </Card>
        ))}
      </div>
      <Card>
        <p className="text-base font-semibold text-ink">Próximas áreas do Admin</p>
        <p className="mt-1 text-sm text-muted">
          Motoristas, veículos e documentos entram na Fase 2. Reservas, tarifas, distribuição e financeiro vêm nas
          fases seguintes.
        </p>
        <Link href="/admin/organizacoes" className="mt-4 inline-block text-sm font-semibold text-brand-800 hover:underline">
          Gerenciar organizações
        </Link>
      </Card>
    </div>
  );
}
