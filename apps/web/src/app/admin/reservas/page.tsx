import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AdminHeader, AdminSkeleton, DataTable, EmptyRow, Pagination, Panel, Pill, TabsNav, Td, Th, formatDateTime, formatDay } from "@/components/admin/kit";
import { Icon } from "@/components/icons";
import { requireArea } from "@/lib/auth";
import { BOOKING_TABS, countBookings, listBookings, type BookingTabKey } from "@/lib/booking-data";
import { BOOKING_STATUS_LABEL, BOOKING_STATUS_TONE, formatMoney } from "@/lib/bookings";
import { hrefWith, oneOf, pageNumber, param, type RawParams } from "@/lib/query";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Reservas · Admin" };

const PAGE_SIZE = 20;
const TAB_KEYS = BOOKING_TABS.map((t) => t.key) as BookingTabKey[];

export default function ReservasPage({ searchParams }: PageProps<"/admin/reservas">) {
  return (
    <>
      <AdminHeader title="Reservas" description="Todas as contratações das agências. Reservas aguardando cotação dependem de você para receber preço." />
      <Suspense fallback={<AdminSkeleton />}>
        <List searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function List({ searchParams }: { searchParams: Promise<RawParams> }) {
  await requireArea("admin");
  const params = await searchParams;
  const tab = oneOf(param(params, "aba"), TAB_KEYS, "todas");
  const q = param(params, "q").slice(0, 20);
  const page = pageNumber(params);
  const current: Record<string, string> = {};
  if (tab !== "todas") current.aba = tab;
  if (q) current.q = q;

  const supabase = await createClient();
  const [{ rows, total, error }, counts] = await Promise.all([listBookings(supabase, { tab, q, page, pageSize: PAGE_SIZE }), countBookings(supabase)]);

  return (
    <Panel>
      <TabsNav
        label="Situação"
        items={BOOKING_TABS.map((t) => ({
          label: t.label,
          count: counts[t.key],
          active: t.key === tab,
          href: hrefWith("/admin/reservas", current, { aba: t.key === "todas" ? null : t.key, pagina: null }),
        }))}
      />
      <div className="flex flex-wrap items-center gap-2.5 border-b border-[#EEF1F7] px-4 py-3.5">
        <form action="/admin/reservas" className="flex h-[38px] min-w-60 flex-1 items-center gap-2 rounded-[10px] border border-[#DCE2EE] px-3 text-muted sm:max-w-sm">
          {tab !== "todas" ? <input type="hidden" name="aba" value={tab} /> : null}
          <Icon name="search" size={16} />
          <label htmlFor="bk-q" className="sr-only">
            Buscar pelo código
          </label>
          <input id="bk-q" name="q" type="search" defaultValue={q} placeholder="Código da reserva (GT-000123)" className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none" />
        </form>
        {q ? (
          <Link href={hrefWith("/admin/reservas", current, { q: null, pagina: null })} className="text-[13px] font-semibold text-brand-600 hover:underline">
            Limpar busca
          </Link>
        ) : null}
      </div>
      <DataTable minWidth={920}>
        <thead>
          <tr>
            <Th>Reserva</Th>
            <Th>Agência</Th>
            <Th>Passageiro</Th>
            <Th>Primeiro embarque</Th>
            <Th align="right">Total</Th>
            <Th>Situação</Th>
            <Th>Criada em</Th>
          </tr>
        </thead>
        <tbody>
          {error ? (
            <EmptyRow colSpan={7} title="Não foi possível carregar as reservas">
              Confirme que a migração 20261115000005 foi rodada e recarregue.
            </EmptyRow>
          ) : rows.length === 0 ? (
            <EmptyRow colSpan={7} title="Nenhuma reserva aqui">
              As reservas aparecem quando uma agência cria um pedido no portal dela.
            </EmptyRow>
          ) : (
            rows.map((b) => {
              const first = [...b.segments].sort((a, c) => a.pickup_at.localeCompare(c.pickup_at))[0];
              return (
                <tr key={b.id} className="hover:bg-[#F8FAFD]">
                  <Td>
                    <Link href={`/admin/reservas/${b.id}`} className="flex flex-col font-bold text-brand-800 hover:underline">
                      {b.code}
                      <span className="text-xs font-normal text-muted">
                        {b.segments.length} {b.segments.length === 1 ? "trecho" : "trechos"}
                      </span>
                    </Link>
                  </Td>
                  <Td className="text-[#33405F]">{b.agency?.trade_name ?? "—"}</Td>
                  <Td className="font-semibold">{b.passenger?.full_name ?? "—"}</Td>
                  <Td className="text-[#33405F]">
                    {first ? (
                      <span className="flex flex-col">
                        <span className="tabular-nums">{formatDateTime(first.pickup_at)}</span>
                        <span className="max-w-64 truncate text-xs text-muted">
                          {first.origin_snapshot.name} → {first.destination_snapshot.name}
                        </span>
                      </span>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td align="right" className="font-semibold">
                    {formatMoney(b.total_cents)}
                  </Td>
                  <Td>
                    <Pill tone={BOOKING_STATUS_TONE[b.status]}>{BOOKING_STATUS_LABEL[b.status]}</Pill>
                  </Td>
                  <Td className="tabular-nums text-[#33405F]">{formatDay(b.created_at)}</Td>
                </tr>
              );
            })
          )}
        </tbody>
      </DataTable>
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} makeHref={(p) => hrefWith("/admin/reservas", current, { pagina: p === 1 ? null : p })} />
    </Panel>
  );
}
