import type { ReactNode } from "react";
import { Pill, formatDateTime, type Tone } from "@/components/admin/kit";
import { Icon } from "@/components/icons";
import { LOCATION_KIND_LABEL, SERVICE_KIND_LABEL, formatMoney } from "@/lib/bookings";
import type { ServiceBrief } from "@/lib/dispatch";
import { formatPlate } from "@/lib/fleet";

/** Cartão de serviço para a transportadora: só os dados que ela pode ver. */
export function ServiceBriefCard({
  brief,
  badge,
  payoutCents,
  children,
}: {
  brief: Omit<ServiceBrief, "status">;
  badge: { label: string; tone: Tone };
  payoutCents?: number | null;
  children?: ReactNode;
}) {
  const b = brief;
  const facts = [
    `${b.pax_count} ${b.pax_count === 1 ? "passageiro" : "passageiros"}`,
    b.category,
    b.luggage_large ? `${b.luggage_large} malas grandes` : null,
    b.luggage_medium ? `${b.luggage_medium} malas médias` : null,
    b.child_seats ? `${b.child_seats} cadeirinha(s)` : null,
    b.needs_accessible ? "Veículo acessível" : null,
    b.trip_reference ? `Voo/linha ${b.trip_reference}` : null,
    b.distance_km ? `${String(b.distance_km).replace(".", ",")} km` : null,
    b.duration_min ? `${b.duration_min} min` : null,
  ].filter(Boolean);
  return (
    <article className="flex h-full flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-base font-bold text-ink">
            <Icon name="clock" size={16} />
            {formatDateTime(b.pickup_at)}
          </p>
          <p className="text-[13px] text-muted">
            {SERVICE_KIND_LABEL[b.service_kind]} · {b.booking_code}
          </p>
        </div>
        <Pill tone={badge.tone}>{badge.label}</Pill>
      </header>
      <div className="grid gap-2 text-sm sm:grid-cols-2">
        <p>
          <span className="block text-xs font-bold uppercase tracking-wide text-muted">Embarque</span>
          <span className="font-semibold">{b.origin.name}</span>
          <span className="block text-[13px] text-muted">
            {LOCATION_KIND_LABEL[b.origin.kind]} · {b.origin.city}/{b.origin.state}
          </span>
        </p>
        <p>
          <span className="block text-xs font-bold uppercase tracking-wide text-muted">Destino</span>
          <span className="font-semibold">{b.destination.name}</span>
          <span className="block text-[13px] text-muted">
            {LOCATION_KIND_LABEL[b.destination.kind]} · {b.destination.city}/{b.destination.state}
          </span>
        </p>
      </div>
      <p className="text-[13px] text-[#33405F]">{facts.join(" · ")}</p>
      {b.passenger ? (
        <p className="rounded-xl bg-[#F8FAFD] px-3 py-2 text-sm">
          Passageiro: <strong>{b.passenger.name}</strong>
          {b.passenger.phone ? ` · ${b.passenger.phone}` : ""}
          {b.notes ? <span className="block text-[13px] text-muted">Observação: {b.notes}</span> : null}
        </p>
      ) : null}
      {b.driver ? (
        <p className="text-sm">
          Motorista: <strong>{b.driver.name}</strong>
          {b.vehicle ? ` · ${b.vehicle.label} ${formatPlate(b.vehicle.plate)}` : ""}
        </p>
      ) : null}
      {payoutCents !== undefined && payoutCents !== null ? (
        <p className="mt-auto border-t border-[#EEF1F7] pt-3">
          <span className="block text-xs font-bold uppercase tracking-wide text-muted">Você recebe</span>
          <span className="font-display text-2xl font-extrabold text-ink">{formatMoney(payoutCents)}</span>
        </p>
      ) : null}
      {children}
    </article>
  );
}
