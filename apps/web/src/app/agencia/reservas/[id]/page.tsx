import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Pill, formatDateTime } from "@/components/admin/kit";
import { AppShell, PageSkeleton } from "@/components/app-shell";
import { ActionButton, ReasonForm } from "@/components/booking-forms";
import { SegmentCard } from "@/components/booking-view";
import { Alert, Card } from "@/components/ui";
import { orgIsActive, requireArea } from "@/lib/auth";
import { cancelBooking, cancelSegment, confirmBooking, refreshQuote } from "@/lib/booking-actions";
import { loadBooking } from "@/lib/booking-data";
import { BOOKING_STATUS_LABEL, BOOKING_STATUS_TONE, formatMoney } from "@/lib/bookings";
import { AGENCY_NAV } from "@/lib/nav";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Reserva" };

export default function ReservaPage({ params }: PageProps<"/agencia/reservas/[id]">) {
  return (
    <AppShell area="Portal da agência" nav={AGENCY_NAV}>
      <Suspense fallback={<PageSkeleton />}>
        <Detail params={params} />
      </Suspense>
    </AppShell>
  );
}

async function Detail({ params }: { params: Promise<{ id: string }> }) {
  const { memberships } = await requireArea("agencia");
  const { id } = await params;
  const supabase = await createClient();
  const data = await loadBooking(supabase, id);
  if (!data) notFound();
  const { booking, segments, services } = data;
  const membership = memberships.find((m) => m.organization.id === booking.agency_id);
  if (!membership) notFound();

  const canOperate = orgIsActive(membership) && (membership.role === "agency_admin" || membership.role === "agency_agent");
  const now = new Date().getTime();
  const isExpired = (s: (typeof segments)[number]) => s.status === "quoted" && s.quote_valid_until !== null && new Date(s.quote_valid_until).getTime() < now;
  const anyExpired = segments.some(isExpired);
  const open = booking.status === "awaiting_quote" || booking.status === "quoted";
  const cancellable = !["cancelled", "completed"].includes(booking.status);
  const live = segments.filter((s) => s.status !== "cancelled");

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href="/agencia/reservas" className="text-sm font-semibold text-brand-800 hover:underline">
          ← Reservas
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-ink">Reserva {booking.code}</h1>
            <p className="mt-1 text-sm text-muted">
              {booking.passenger?.full_name ?? "Passageiro"}
              {booking.external_ref ? ` · ref. ${booking.external_ref}` : ""} · criada em {formatDateTime(booking.created_at)}
            </p>
          </div>
          <Pill tone={BOOKING_STATUS_TONE[booking.status]}>{BOOKING_STATUS_LABEL[booking.status]}</Pill>
        </div>
      </div>

      {booking.status === "awaiting_quote" ? (
        <Alert tone="warning">Um ou mais trechos não têm preço de tabela. A equipe GoTransfer vai enviar a cotação; você confirma quando todos tiverem preço.</Alert>
      ) : null}
      {booking.status === "quoted" && anyExpired ? <Alert tone="warning">A cotação venceu. Recalcule o preço para poder confirmar.</Alert> : null}
      {booking.status === "confirmed" ? (
        <Alert tone="success">Reserva confirmada. A GoTransfer está distribuindo os serviços; o prestador e o motorista aparecem aqui quando forem definidos.</Alert>
      ) : null}
      {booking.status === "cancelled" ? <Alert>Reserva cancelada{booking.cancel_reason ? `: ${booking.cancel_reason}` : "."}</Alert> : null}

      <div className="grid items-start gap-5 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          {segments.map((s) => (
            <SegmentCard
              key={s.id}
              segment={s}
              service={services.find((v) => v.segment_id === s.id && v.status !== "cancelled") ?? services.find((v) => v.segment_id === s.id)}
              expired={isExpired(s)}
              title={segments.length > 1 ? (s.position === 1 ? "Ida" : s.position === 2 ? "Volta" : `Trecho ${s.position}`) : "Trecho"}
            >
              {canOperate && cancellable && s.status !== "cancelled" && live.length > 1 ? (
                <ReasonForm action={cancelSegment.bind(null, "agencia", booking.id, s.id)} summary="Cancelar só este trecho" button="Cancelar trecho" />
              ) : null}
            </SegmentCard>
          ))}
        </div>

        <Card className="flex flex-col gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-muted">Total da reserva</p>
            <p className="text-3xl font-extrabold text-ink">{booking.status === "awaiting_quote" && booking.total_cents === 0 ? "Em cotação" : formatMoney(booking.total_cents)}</p>
            <p className="mt-1 text-[13px] text-muted">Valor que sua agência paga ao GoTransfer. Pagamento faturado, sem cobrança on-line.</p>
          </div>
          {canOperate ? (
            <>
              {booking.status === "quoted" && !anyExpired ? (
                <ActionButton
                  action={confirmBooking.bind(null, "agencia", booking.id)}
                  label="Confirmar reserva"
                  pendingLabel="Confirmando…"
                  confirmMessage={`Confirmar a reserva por ${formatMoney(booking.total_cents)}? Sua agência passa a dever este valor.`}
                />
              ) : null}
              {open ? <ActionButton action={refreshQuote.bind(null, "agencia", booking.id)} label="Recalcular preço" variant="secondary" pendingLabel="Recalculando…" /> : null}
              {cancellable ? <ReasonForm action={cancelBooking.bind(null, "agencia", booking.id)} summary="Cancelar a reserva inteira" button="Cancelar reserva" /> : null}
            </>
          ) : (
            <p className="text-sm text-muted">Seu acesso é só de consulta nesta reserva.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
