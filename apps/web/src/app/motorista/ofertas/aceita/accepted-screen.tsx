"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Icon } from "@/components/icons";
import { DRIVER, formatMoney } from "@/lib/driver/mock";
import { useDriver } from "../../driver-store";
import { dayLabel } from "../../ui";

export function AcceptedScreen() {
  const params = useSearchParams();
  const { services } = useDriver();
  const service = services.find((s) => s.id === params.get("servico"));

  if (!service) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-lg font-bold">Nenhuma oferta aceita agora</p>
        <Link href="/motorista/ofertas" className="font-semibold text-brand-600">
          Ver ofertas
        </Link>
      </div>
    );
  }

  return (
    <main className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto bg-surface px-6 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-12">
      <div className="flex flex-col items-center gap-3.5 text-center">
        <div className="grid size-24 place-items-center rounded-full bg-success-50">
          <div className="grid size-17 place-items-center rounded-full bg-success-700 text-white">
            <Icon name="check" size={36} strokeWidth={2.6} />
          </div>
        </div>
        <h1 className="font-display text-[26px] font-extrabold" role="status">
          O serviço é seu
        </h1>
        <p className="max-w-72 text-[15px] leading-relaxed text-muted">Aceite confirmado pela GoTransfer. Ele já está na sua agenda.</p>
      </div>

      <article className="flex flex-col gap-3.5 rounded-[20px] border border-line bg-canvas p-4.5">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold text-muted">Serviço {service.code}</span>
          <span className="rounded-full bg-success-50 px-2.5 py-1 text-xs font-bold text-success-700">Atribuído</span>
        </div>
        <div>
          <p className="font-display text-xl font-extrabold capitalize">
            {dayLabel(service.dayOffset)}, {service.time}
          </p>
          <p className="text-[15px] font-semibold">
            {service.pickup.title} → {service.dropoff.title}
          </p>
        </div>
        <dl className="flex flex-col gap-2.5 border-t border-line pt-3 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Veículo</dt>
            <dd className="font-semibold">
              {DRIVER.vehicle.name.replace("Toyota ", "")} · {DRIVER.vehicle.plate}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Passageiro</dt>
            <dd className="font-semibold">
              {service.passenger.name} · {service.luggage.large + service.luggage.medium} malas
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Você recebe</dt>
            <dd className="font-extrabold text-success-700">{formatMoney(service.payoutCents)}</dd>
          </div>
        </dl>
      </article>

      <p className="flex gap-2.5 rounded-2xl bg-brand-100/60 px-4 py-3.5 text-[13px] leading-relaxed">
        <Icon name="bell" size={18} className="mt-px shrink-0 text-brand-800" />
        Vamos lembrar você 40 minutos antes. O passageiro recebe seu nome, veículo e placa quando você iniciar o deslocamento.
      </p>

      <div className="mt-auto flex flex-col gap-2.5">
        <Link
          href={`/motorista/servico/${service.id}`}
          className="flex h-13.5 items-center justify-center rounded-2xl bg-brand-800 text-base font-bold text-white hover:bg-brand-700"
        >
          Ver serviço
        </Link>
        <Link
          href="/motorista/ofertas"
          className="flex h-13.5 items-center justify-center rounded-2xl border border-line text-base font-semibold hover:bg-canvas"
        >
          Voltar às ofertas
        </Link>
      </div>
    </main>
  );
}
