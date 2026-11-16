"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { Icon } from "@/components/icons";
import { formatMoney, type DriverService, type Step } from "@/lib/driver/mock";
import { useDriver } from "../driver-store";
import { addMinutes, compareService } from "../time";
import { ScreenTitle, TabScreen } from "../ui";

const STATUS: Record<Step, { label: string; className: string }> = {
  assigned: { label: "Atribuído", className: "bg-canvas text-ink" },
  en_route: { label: "A caminho", className: "bg-brand-100/70 text-brand-800" },
  arrived: { label: "No embarque", className: "bg-brand-100/70 text-brand-800" },
  boarding: { label: "Embarque", className: "bg-brand-100/70 text-brand-800" },
  in_progress: { label: "Em viagem", className: "bg-brand-100/70 text-brand-800" },
  completed: { label: "Concluído", className: "bg-success-50 text-success-700" },
};

export function AgendaScreen() {
  const { services } = useDriver();
  const [selected, setSelected] = useState(0);
  const [days] = useState(() => {
    const base = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      return {
        offset: i,
        weekday: d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "").toUpperCase(),
        day: d.getDate(),
        month: capitalize(d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })),
      };
    });
  });

  const dayServices = services.filter((s) => s.dayOffset === selected).sort(compareService);
  const total = dayServices.reduce((sum, s) => sum + (s.payoutCents ?? 0), 0);
  const firstOpen = dayServices.find((s) => s.step !== "completed");

  return (
    <TabScreen
      header={
        <div className="border-b border-line bg-surface">
          <ScreenTitle aside={<span className="text-sm font-semibold text-muted">{days[selected].month}</span>}>Agenda</ScreenTitle>
          <div className="grid grid-cols-7 gap-1.5 px-5 pb-4" role="group" aria-label="Escolher dia">
            {days.map((d) => {
              const active = d.offset === selected;
              const busy = services.some((s) => s.dayOffset === d.offset);
              return (
                <button
                  key={d.offset}
                  type="button"
                  aria-pressed={active}
                  aria-label={`${d.weekday} ${d.day}${busy ? ", com serviços" : ""}`}
                  onClick={() => setSelected(d.offset)}
                  className={`flex h-16 flex-col items-center justify-center gap-0.5 rounded-[14px] ${
                    active ? "bg-brand-800 text-white" : "bg-canvas text-ink"
                  }`}
                >
                  <span className={`text-[11px] font-semibold ${active ? "" : "text-muted"}`}>{d.weekday}</span>
                  <span className="text-lg font-extrabold">{d.day}</span>
                  <span aria-hidden className={`size-1.5 rounded-full ${busy ? (active ? "bg-accent-300" : "bg-brand-600") : "bg-transparent"}`} />
                </button>
              );
            })}
          </div>
        </div>
      }
    >
      <p className="text-[13px] font-semibold text-muted">
        {selected === 0 ? "Hoje" : selected === 1 ? "Amanhã" : `${days[selected].weekday} ${days[selected].day}`} ·{" "}
        {dayServices.length} {dayServices.length === 1 ? "serviço" : "serviços"}
        {total ? ` · ${formatMoney(total)}` : ""}
      </p>

      {dayServices.length === 0 ? (
        <div className="rounded-[20px] border border-dashed border-line bg-surface px-5 py-10 text-center">
          <p className="font-bold">Dia livre</p>
          <p className="mt-1 text-sm text-muted">Serviços aceitos para este dia aparecem aqui.</p>
        </div>
      ) : (
        dayServices.map((s, i) => {
          const prev = dayServices[i - 1];
          return (
            <Fragment key={s.id}>
              {prev ? <Gap from={prev} to={s} /> : null}
              <AgendaItem service={s} highlight={s.id === firstOpen?.id} />
            </Fragment>
          );
        })
      )}
    </TabScreen>
  );
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function AgendaItem({ service: s, highlight }: { service: DriverService; highlight: boolean }) {
  const done = s.step === "completed";
  const status = STATUS[s.step];
  return (
    <div className="flex gap-3">
      <span className={`w-12 pt-4 text-sm ${highlight ? "font-extrabold text-brand-800" : "font-bold text-muted"}`}>{s.time}</span>
      <Link
        href={`/motorista/servico/${s.id}`}
        className={`flex flex-1 flex-col gap-1.5 rounded-[18px] bg-surface px-4 py-3.5 ${
          highlight ? "border-2 border-brand-600 shadow-(--shadow-card)" : "border border-line"
        }`}
      >
        <span className="flex items-center justify-between gap-2">
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${status.className}`}>
            {highlight && s.step === "assigned" ? "Próximo" : status.label}
          </span>
          <span className={`text-sm font-extrabold ${done ? "text-muted" : "text-success-700"}`}>{formatMoney(s.payoutCents)}</span>
        </span>
        <span className={`text-[15px] font-bold ${done ? "text-muted" : ""}`}>
          {s.pickup.title.split(" · ")[0]} → {s.dropoff.title.split(" · ")[0]}
        </span>
        <span className="text-[13px] text-muted">
          {s.flight ? `Voo ${s.flight.number} · ` : ""}
          {s.passenger.count} pass. · {s.luggage.large + s.luggage.medium} malas
        </span>
      </Link>
    </div>
  );
}

function Gap({ from, to }: { from: DriverService; to: DriverService }) {
  const end = addMinutes(from.time, from.durationMin ?? 0);
  const [eh, em] = end.split(":").map(Number);
  const [sh, sm] = to.time.split(":").map(Number);
  const minutes = sh * 60 + sm - (eh * 60 + em);
  const tight = minutes < 45;
  const text = minutes <= 0 ? "Horários se sobrepõem" : `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")} livres até o próximo embarque`;
  return (
    <p className={`ml-15 flex items-center gap-1.5 text-xs ${tight ? "font-semibold text-warning-700" : "text-muted"}`}>
      <Icon name={tight ? "alert" : "clock"} size={14} strokeWidth={2} />
      {text}
    </p>
  );
}
