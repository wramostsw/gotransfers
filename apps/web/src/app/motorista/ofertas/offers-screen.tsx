"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/icons";
import { formatMoney, routeInfo, type ServiceKind } from "@/lib/driver/mock";
import { formatCountdown, secondsLeft, useDriver } from "../driver-store";
import { KindChip, RouteLine, ScreenTitle, TabScreen, Tag } from "../ui";

type Filter = "all" | "airport" | "bus";

const MATCH: Record<Filter, (k: ServiceKind) => boolean> = {
  all: () => true,
  airport: (k) => k !== "bus_station",
  bus: (k) => k === "bus_station",
};

export function OffersScreen() {
  const { offers, online, now, acceptOffer, declineOffer } = useDriver();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [lost, setLost] = useState(false);
  const visible = [...offers].sort((a, b) => a.expiresAt - b.expiresAt).filter((o) => MATCH[filter](o.service.kind));

  function accept(offerId: string) {
    const service = acceptOffer(offerId);
    if (!service) {
      setLost(true);
      return;
    }
    router.push(`/motorista/ofertas/aceita?servico=${service.id}`);
  }

  const filters: Array<{ id: Filter; label: string }> = [
    { id: "all", label: `Todas · ${offers.length}` },
    { id: "airport", label: "Aeroporto" },
    { id: "bus", label: "Rodoviária" },
  ];

  return (
    <TabScreen
      header={
        <div className="border-b border-line bg-surface">
          <ScreenTitle
            aside={
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${online ? "bg-success-50 text-success-700" : "bg-canvas text-muted"}`}>
                {online ? "Disponível" : "Indisponível"}
              </span>
            }
          >
            Oportunidades
          </ScreenTitle>
          <div className="flex gap-2 px-5 pb-3.5" role="group" aria-label="Filtrar ofertas">
            {filters.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={`h-9 rounded-full px-3.5 text-[13px] ${
                  filter === f.id ? "bg-brand-800 font-bold text-white" : "border border-line bg-surface font-semibold"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      }
    >
      {lost ? (
        <p role="alert" className="rounded-2xl bg-warning-50 px-4 py-3 text-sm font-semibold text-warning-700">
          Esta oferta não está mais disponível: o prazo acabou ou outro motorista aceitou primeiro.
        </p>
      ) : null}

      {!online ? (
        <Empty title="Você está indisponível" text="Ative a disponibilidade na tela inicial para receber ofertas." />
      ) : visible.length === 0 ? (
        <Empty title="Nenhuma oferta agora" text="Quando surgir um serviço compatível com você e seu veículo, ele aparece aqui." />
      ) : (
        visible.map((offer, index) => {
          const left = secondsLeft(offer, now);
          const s = offer.service;
          const total = offer.expiresInSec;
          const pct = Math.round((left / total) * 100);
          const urgent = index === 0;
          return (
            <article
              key={offer.id}
              className={`flex flex-col gap-3.5 rounded-[20px] bg-surface p-4.5 ${
                urgent ? "border-2 border-accent-700 shadow-(--shadow-card)" : "border border-line"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-col gap-1.5">
                  <KindChip service={s} withDay />
                  <span className="font-display text-2xl font-extrabold">{s.time}</span>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <div
                    className="grid size-14.5 place-items-center rounded-full"
                    style={{ background: `conic-gradient(#C2410C 0 ${pct}%, #FBE3D2 ${pct}% 100%)` }}
                  >
                    <span className="grid size-11.5 place-items-center rounded-full bg-surface text-[15px] font-extrabold tabular-nums text-accent-800">
                      {formatCountdown(left)}
                    </span>
                  </div>
                  <span className="text-[11px] font-semibold text-muted">para aceitar</span>
                </div>
              </div>
              <RouteLine
                from={{ title: s.pickup.title, detail: `Você está a ${offer.distanceToPickupKm} km · ${offer.pickupHint}` }}
                to={{ title: s.dropoff.title, detail: routeInfo(s) }}
              />
              <div className="flex flex-wrap gap-2">
                <Tag>{s.category}</Tag>
                <Tag>
                  {s.passenger.count} {s.passenger.count === 1 ? "passageiro" : "passageiros"}
                </Tag>
                <Tag>{s.luggage.large + s.luggage.medium} malas</Tag>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-muted">Você recebe</span>
                <span className="font-display text-2xl font-extrabold text-success-700">{formatMoney(s.payoutCents)}</span>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => declineOffer(offer.id)}
                  className="h-13 rounded-[14px] border border-line bg-surface text-[15px] font-bold hover:bg-canvas"
                >
                  Recusar
                </button>
                <button
                  type="button"
                  onClick={() => accept(offer.id)}
                  className="h-13 rounded-[14px] bg-accent-700 text-[15px] font-bold text-white hover:bg-accent-800"
                >
                  Aceitar
                </button>
              </div>
            </article>
          );
        })
      )}

      <p className="flex gap-2 text-xs leading-relaxed text-muted">
        <Icon name="info" size={16} className="mt-px shrink-0" />O serviço só é seu depois da confirmação. Se outro motorista
        aceitar primeiro, a oferta sai da lista.
      </p>
    </TabScreen>
  );
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-[20px] border border-dashed border-line bg-surface px-5 py-10 text-center">
      <p className="font-bold">{title}</p>
      <p className="mx-auto mt-1 max-w-64 text-sm text-muted">{text}</p>
    </div>
  );
}
