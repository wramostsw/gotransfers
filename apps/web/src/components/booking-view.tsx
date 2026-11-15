import type { ReactNode } from "react";
import { Pill, formatDateTime } from "@/components/admin/kit";
import { Icon } from "@/components/icons";
import type { SegmentRecord, ServiceRecord } from "@/lib/booking-data";
import {
  LOCATION_KIND_LABEL,
  PRICING_MODE_LABEL,
  SEGMENT_STATUS_LABEL,
  SEGMENT_STATUS_TONE,
  SERVICE_KIND_LABEL,
  SERVICE_STATUS_LABEL,
  formatMoney,
  type LocationSnapshot,
} from "@/lib/bookings";

function Place({ label, place }: { label: string; place: LocationSnapshot }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-bold uppercase tracking-wide text-muted">{label}</p>
      <p className="truncate font-semibold text-ink">
        {place.name}
        {place.code ? ` (${place.code})` : ""}
      </p>
      <p className="truncate text-[13px] text-muted">
        {LOCATION_KIND_LABEL[place.kind]} · {place.address_line ? `${place.address_line} · ` : ""}
        {place.city}/{place.state}
      </p>
    </div>
  );
}

/** Cartão de um trecho da reserva. `children` recebe ações e detalhes próprios de cada portal. */
export function SegmentCard({
  segment,
  service,
  expired,
  title,
  children,
}: {
  segment: SegmentRecord;
  service?: ServiceRecord;
  expired: boolean;
  title: string;
  children?: ReactNode;
}) {
  const s = segment;
  const facts = [
    `${s.pax_count} ${s.pax_count === 1 ? "passageiro" : "passageiros"}`,
    s.category?.name,
    s.luggage_large ? `${s.luggage_large} malas grandes` : null,
    s.luggage_medium ? `${s.luggage_medium} malas médias` : null,
    s.child_seats ? `${s.child_seats} cadeirinha(s)` : null,
    s.needs_accessible ? "Veículo acessível" : null,
    s.trip_reference ? `Voo/linha ${s.trip_reference}` : null,
    s.distance_km ? `${String(s.distance_km).replace(".", ",")} km` : null,
    s.duration_min ? `${s.duration_min} min` : null,
  ].filter(Boolean);

  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-brand-800">{title}</p>
          <h3 className="mt-0.5 text-base font-bold text-ink">{SERVICE_KIND_LABEL[s.service_kind]}</h3>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-[#33405F]">
            <Icon name="clock" size={15} />
            {formatDateTime(s.pickup_at)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <Pill tone={SEGMENT_STATUS_TONE[s.status]}>{SEGMENT_STATUS_LABEL[s.status]}</Pill>
          {service && s.status !== "cancelled" ? <Pill tone="blue">{SERVICE_STATUS_LABEL[service.status]}</Pill> : null}
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <Place label="Origem" place={s.origin_snapshot} />
        <Place label="Destino" place={s.destination_snapshot} />
      </div>

      <p className="text-[13px] text-[#33405F]">{facts.join(" · ")}</p>
      {s.notes ? <p className="rounded-xl bg-[#F8FAFD] px-3 py-2 text-sm text-ink">Observação: {s.notes}</p> : null}
      {s.status === "cancelled" && s.cancel_reason ? (
        <p className="rounded-xl bg-danger-50 px-3 py-2 text-sm text-[#8C1D16]">Cancelado: {s.cancel_reason}</p>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-3 border-t border-[#EEF1F7] pt-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Valor do trecho</p>
          {s.sale_price_cents ? (
            <p className={`font-display text-2xl font-extrabold ${s.status === "cancelled" ? "text-muted line-through" : "text-ink"}`}>{formatMoney(s.sale_price_cents)}</p>
          ) : (
            <p className="text-base font-semibold text-warning-700">Em cotação pela equipe GoTransfer</p>
          )}
        </div>
        <p className="text-right text-[13px] text-muted">
          {PRICING_MODE_LABEL[s.pricing_mode]}
          {s.status === "quoted" && s.quote_valid_until ? (
            <span className={`block ${expired ? "font-bold text-danger-700" : ""}`}>
              {expired ? "Cotação vencida em " : "Válido até "}
              {formatDateTime(s.quote_valid_until)}
            </span>
          ) : null}
        </p>
      </div>
      {children}
    </article>
  );
}
