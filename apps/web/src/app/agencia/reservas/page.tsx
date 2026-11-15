import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Pagination, Pill, TabsNav, formatDateTime } from "@/components/admin/kit";
import { AppShell, PageHeader, PageSkeleton } from "@/components/app-shell";
import { Card, EmptyState, InactiveOrgNotice, buttonClass } from "@/components/ui";
import { orgIsActive, requireArea } from "@/lib/auth";
import { BOOKING_TABS, countBookings, listBookings, type BookingTabKey } from "@/lib/booking-data";
import { BOOKING_STATUS_LABEL, BOOKING_STATUS_TONE, formatMoney } from "@/lib/bookings";
import { AGENCY_NAV } from "@/lib/nav";
import { hrefWith, oneOf, pageNumber, param, type RawParams } from "@/lib/query";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Reservas" };

const PAGE_SIZE = 15;
const TAB_KEYS = BOOKING_TABS.map((t) => t.key) as BookingTabKey[];

export default function ReservasPage({ searchParams }: PageProps<"/agencia/reservas">) {
  return (
    <AppShell area="Portal da agência" nav={AGENCY_NAV}>
      <PageHeader
        title="Reservas"
        description="Seus pedidos de transfer: cotação, confirmação e acompanhamento."
        action={
          <Link href="/agencia/reservas/nova" className={buttonClass("primary")}>
            Nova reserva
          </Link>
        }
      />
      <Suspense fallback={<PageSkeleton />}>
        <Content searchParams={searchParams} />
      </Suspense>
    </AppShell>
  );
}

async function Content({ searchParams }: { searchParams: Promise<RawParams> }) {
  const { memberships } = await requireArea("agencia");
  const membership = memberships[0];
  const params = await searchParams;
  const tab = oneOf(param(params, "aba"), TAB_KEYS, "todas");
  const page = pageNumber(params);
  const current: Record<string, string> = tab === "todas" ? {} : { aba: tab };
  const agencyId = membership.organization.id;

  const supabase = await createClient();
  const [{ rows, total, error }, counts] = await Promise.all([
    listBookings(supabase, { tab, q: "", page, pageSize: PAGE_SIZE, agencyId }),
    countBookings(supabase, agencyId),
  ]);

  return (
    <div className="flex flex-col gap-5">
      {orgIsActive(membership) ? null : <InactiveOrgNotice orgName={membership.organization.tradeName} status={membership.organization.status} />}
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <TabsNav
          label="Situação"
          items={BOOKING_TABS.map((t) => ({
            label: t.label,
            count: counts[t.key],
            active: t.key === tab,
            href: hrefWith("/agencia/reservas", {}, { aba: t.key === "todas" ? null : t.key }),
          }))}
        />
        {error ? (
          <div className="p-5">
            <EmptyState title="Não foi possível carregar as reservas">Tente recarregar a página.</EmptyState>
          </div>
        ) : rows.length === 0 ? (
          <div className="p-5">
            <EmptyState title="Nenhuma reserva aqui">Crie um pedido em “Nova reserva”. Você vê o preço antes de confirmar.</EmptyState>
          </div>
        ) : (
          <ul className="grid gap-3 p-4 lg:grid-cols-2">
            {rows.map((b) => {
              const legs = [...b.segments].sort((a, c) => a.pickup_at.localeCompare(c.pickup_at));
              return (
                <li key={b.id}>
                  <Link href={`/agencia/reservas/${b.id}`} className="block h-full">
                    <Card className="flex h-full flex-col gap-3 hover:border-brand-600">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-brand-800">{b.code}</p>
                          <p className="truncate text-base font-semibold text-ink">{b.passenger?.full_name ?? "Passageiro"}</p>
                        </div>
                        <Pill tone={BOOKING_STATUS_TONE[b.status]}>{BOOKING_STATUS_LABEL[b.status]}</Pill>
                      </div>
                      <ul className="flex flex-col gap-1.5 text-sm text-[#33405F]">
                        {legs.map((s, i) => (
                          <li key={i} className={s.status === "cancelled" ? "text-muted line-through" : ""}>
                            <span className="font-semibold tabular-nums text-ink">{formatDateTime(s.pickup_at)}</span> · {s.origin_snapshot.name} → {s.destination_snapshot.name}
                          </li>
                        ))}
                      </ul>
                      <p className="mt-auto text-lg font-bold text-ink">{b.status === "awaiting_quote" ? "Preço em cotação" : formatMoney(b.total_cents)}</p>
                    </Card>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} makeHref={(p) => hrefWith("/agencia/reservas", current, { pagina: p === 1 ? null : p })} />
      </div>
    </div>
  );
}
