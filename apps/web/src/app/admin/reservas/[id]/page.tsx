import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AdminHeader, AdminSkeleton, DataTable, Panel, PanelHeader, Pill, Td, Th, formatDateTime } from "@/components/admin/kit";
import { ActionButton, ManualQuoteForm, ReasonForm } from "@/components/booking-forms";
import { SegmentCard } from "@/components/booking-view";
import { requireArea } from "@/lib/auth";
import { cancelBooking, cancelSegment, confirmBooking, refreshQuote, setManualQuote } from "@/lib/booking-actions";
import { loadBooking } from "@/lib/booking-data";
import { BOOKING_STATUS_LABEL, BOOKING_STATUS_TONE, LEDGER_ACCOUNT_LABEL, SERVICE_STATUS_LABEL, formatMoney, moneyInput } from "@/lib/bookings";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Reserva · Admin" };

type CostRow = {
  segment_id: string;
  provider_payout_cents: number;
  platform_fee_cents: number;
  rule_version: number | null;
  rule_snapshot: { name?: string } | null;
};
type LedgerRow = {
  id: number;
  account: string;
  direction: "debit" | "credit";
  amount_cents: number;
  entry_type: string;
  description: string | null;
  created_at: string;
};

const ORIGIN_LABEL: Record<string, string> = { agency: "Agência", platform: "GoTransfer", provider: "Prestador", driver: "Motorista", system: "Sistema" };

export default function ReservaPage({ params }: PageProps<"/admin/reservas/[id]">) {
  return (
    <Suspense fallback={<AdminSkeleton />}>
      <Detail params={params} />
    </Suspense>
  );
}

async function Detail({ params }: { params: Promise<{ id: string }> }) {
  await requireArea("admin");
  const { id } = await params;
  const supabase = await createClient();
  const data = await loadBooking(supabase, id);
  if (!data) notFound();
  const { booking, segments, services, events } = data;
  const segmentIds = segments.map((s) => s.id);
  const [costs, ledger] = await Promise.all([
    supabase.from("segment_costs").select("segment_id, provider_payout_cents, platform_fee_cents, rule_version, rule_snapshot").in("segment_id", segmentIds).returns<CostRow[]>(),
    supabase.from("ledger_entries").select("id, account, direction, amount_cents, entry_type, description, created_at").eq("booking_id", id).order("id").returns<LedgerRow[]>(),
  ]);
  const costBySegment = new Map((costs.data ?? []).map((c) => [c.segment_id, c]));
  const now = new Date().getTime();
  const open = booking.status === "awaiting_quote" || booking.status === "quoted";
  const cancellable = !["cancelled", "completed"].includes(booking.status);
  const fee = segments.filter((s) => s.status !== "cancelled").reduce((sum, s) => sum + (costBySegment.get(s.id)?.platform_fee_cents ?? 0), 0);
  const payout = segments.filter((s) => s.status !== "cancelled").reduce((sum, s) => sum + (costBySegment.get(s.id)?.provider_payout_cents ?? 0), 0);

  return (
    <>
      <AdminHeader
        title={`Reserva ${booking.code}`}
        crumbs={[{ label: "Reservas", href: "/admin/reservas" }, { label: booking.code }]}
        actions={<Pill tone={BOOKING_STATUS_TONE[booking.status]}>{BOOKING_STATUS_LABEL[booking.status]}</Pill>}
      />

      <div className="grid items-start gap-4 xl:grid-cols-3">
        <div className="flex flex-col gap-4 xl:col-span-2">
          {segments.map((s) => {
            const cost = costBySegment.get(s.id);
            const expired = s.status === "quoted" && s.quote_valid_until !== null && new Date(s.quote_valid_until).getTime() < now;
            const canQuote = open && (s.status === "awaiting_quote" || (s.status === "quoted" && s.pricing_mode === "manual"));
            return (
              <SegmentCard
                key={s.id}
                segment={s}
                service={services.find((v) => v.segment_id === s.id && v.status !== "cancelled") ?? services.find((v) => v.segment_id === s.id)}
                expired={expired}
                title={segments.length > 1 ? `Trecho ${s.position} de ${segments.length}` : "Trecho único"}
              >
                {cost ? (
                  <dl className="grid grid-cols-3 gap-3 rounded-xl bg-[#F8FAFD] px-4 py-3 text-sm">
                    <div>
                      <dt className="text-xs font-bold uppercase tracking-wide text-muted">Taxa GoTransfer</dt>
                      <dd className="font-bold text-success-700">{formatMoney(cost.platform_fee_cents)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-bold uppercase tracking-wide text-muted">Prestador recebe</dt>
                      <dd className="font-bold">{formatMoney(cost.provider_payout_cents)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-bold uppercase tracking-wide text-muted">Origem do preço</dt>
                      <dd className="truncate text-[#33405F]">{cost.rule_snapshot?.name ? `${cost.rule_snapshot.name} · v${cost.rule_version}` : "Cotação manual"}</dd>
                    </div>
                  </dl>
                ) : null}
                {canQuote ? (
                  <ManualQuoteForm
                    action={setManualQuote.bind(null, booking.id, s.id)}
                    sale={moneyInput(s.sale_price_cents)}
                    payout={cost ? moneyInput(cost.provider_payout_cents) : undefined}
                  />
                ) : null}
                {cancellable && s.status !== "cancelled" && segments.filter((x) => x.status !== "cancelled").length > 1 ? (
                  <ReasonForm action={cancelSegment.bind(null, "admin", booking.id, s.id)} summary="Cancelar só este trecho" button="Cancelar trecho" />
                ) : null}
              </SegmentCard>
            );
          })}

          <Panel>
            <PanelHeader title="Histórico dos serviços" description="Cada mudança de estado, com quem fez e por quê." />
            {events.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted">Os serviços são criados quando a reserva é confirmada.</p>
            ) : (
              <ul>
                {events.map((e) => {
                  const position = segments.find((s) => s.id === services.find((v) => v.id === e.service_id)?.segment_id)?.position;
                  return (
                    <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[#F1F4F9] px-5 py-3 text-sm last:border-0">
                      <span className="w-36 shrink-0 tabular-nums text-muted">{formatDateTime(e.occurred_at)}</span>
                      <span className="font-semibold">
                        Trecho {position ?? "?"}: {SERVICE_STATUS_LABEL[e.to_status]}
                      </span>
                      <span className="text-[13px] text-muted">
                        {ORIGIN_LABEL[e.origin] ?? e.origin}
                        {e.reason ? ` · ${e.reason}` : ""}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="Lançamentos financeiros" description="Livro-razão desta reserva. Lançamentos não são editados: correções entram como estorno." />
            {(ledger.data ?? []).length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted">Nenhum lançamento. Eles são gerados na confirmação.</p>
            ) : (
              <DataTable minWidth={640}>
                <thead>
                  <tr>
                    <Th>Quando</Th>
                    <Th>Conta</Th>
                    <Th>Descrição</Th>
                    <Th align="right">Débito</Th>
                    <Th align="right">Crédito</Th>
                  </tr>
                </thead>
                <tbody>
                  {(ledger.data ?? []).map((l) => (
                    <tr key={l.id}>
                      <Td className="whitespace-nowrap tabular-nums text-[#33405F]">{formatDateTime(l.created_at)}</Td>
                      <Td className="font-semibold">{LEDGER_ACCOUNT_LABEL[l.account] ?? l.account}</Td>
                      <Td className="text-[#33405F]">
                        {l.entry_type === "reversal" ? <Pill tone="red">Estorno</Pill> : null} {l.description}
                      </Td>
                      <Td align="right">{l.direction === "debit" ? formatMoney(l.amount_cents) : ""}</Td>
                      <Td align="right">{l.direction === "credit" ? formatMoney(l.amount_cents) : ""}</Td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            )}
          </Panel>
        </div>

        <div className="flex flex-col gap-4">
          <Panel>
            <PanelHeader title="Resumo" />
            <dl className="flex flex-col gap-3 px-5 py-4 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted">Agência paga</dt>
                <dd className="font-display text-2xl font-extrabold">{formatMoney(booking.total_cents)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Taxa GoTransfer</dt>
                <dd className="font-bold text-success-700">{formatMoney(fee)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Repasse aos prestadores</dt>
                <dd className="font-bold">{formatMoney(payout)}</dd>
              </div>
              <div className="flex justify-between gap-3 border-t border-[#EEF1F7] pt-3">
                <dt className="text-muted">Agência</dt>
                <dd className="text-right font-semibold">
                  <Link href={`/admin/organizacoes/${booking.agency_id}`} className="text-brand-800 hover:underline">
                    {booking.agency?.trade_name ?? "—"}
                  </Link>
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Passageiro</dt>
                <dd className="text-right font-semibold">
                  {booking.passenger?.full_name ?? "—"}
                  {booking.passenger?.phone ? <span className="block text-[13px] font-normal text-muted">{booking.passenger.phone}</span> : null}
                </dd>
              </div>
              {booking.external_ref ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Referência da agência</dt>
                  <dd className="font-semibold">{booking.external_ref}</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Criada em</dt>
                <dd>{formatDateTime(booking.created_at)}</dd>
              </div>
              {booking.confirmed_at ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Confirmada em</dt>
                  <dd>{formatDateTime(booking.confirmed_at)}</dd>
                </div>
              ) : null}
              {booking.cancelled_at ? (
                <div className="flex flex-col gap-1 rounded-xl bg-danger-50 px-3 py-2 text-[#8C1D16]">
                  <dt className="font-bold">Cancelada em {formatDateTime(booking.cancelled_at)}</dt>
                  <dd>{booking.cancel_reason}</dd>
                </div>
              ) : null}
            </dl>
          </Panel>

          {open || cancellable ? (
            <Panel>
              <PanelHeader title="Ações" description="Você age em nome da agência; tudo fica registrado na auditoria." />
              <div className="flex flex-col gap-3 px-5 py-4">
                {booking.status === "quoted" ? (
                  <ActionButton
                    action={confirmBooking.bind(null, "admin", booking.id)}
                    label="Confirmar reserva"
                    pendingLabel="Confirmando…"
                    confirmMessage={`Confirmar a reserva ${booking.code} por ${formatMoney(booking.total_cents)}? A agência passa a dever este valor.`}
                  />
                ) : null}
                {open ? <ActionButton action={refreshQuote.bind(null, "admin", booking.id)} label="Recalcular preços pela tabela" variant="secondary" /> : null}
                {cancellable ? <ReasonForm action={cancelBooking.bind(null, "admin", booking.id)} summary="Cancelar a reserva inteira" button="Cancelar reserva" /> : null}
              </div>
            </Panel>
          ) : null}
        </div>
      </div>
    </>
  );
}
