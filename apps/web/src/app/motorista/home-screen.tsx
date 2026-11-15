"use client";

import Image from "next/image";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { DRIVER, formatMoney } from "@/lib/driver/mock";
import { formatCountdown, secondsLeft, useDriver } from "./driver-store";
import { compareService, relativeStart } from "./time";
import { BottomNav, KindChip, RouteLine } from "./ui";

export function HomeScreen() {
  const { online, setOnline, services, offers, now } = useDriver();
  const today = services.filter((s) => s.dayOffset === 0);
  const next = [...services].filter((s) => s.step !== "completed").sort(compareService)[0];
  const firstOffer = [...offers].sort((a, b) => a.expiresAt - b.expiresAt)[0];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-col gap-4 bg-brand-900 px-5 pb-5 pt-4 text-white">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div aria-hidden className="grid size-11 place-items-center rounded-full bg-accent-300 font-display text-base font-extrabold text-brand-900">
              {DRIVER.initials}
            </div>
            <div>
              <p className="text-[13px] text-on-dark">Bom trabalho hoje</p>
              <h1 className="font-display text-[22px] font-extrabold">Olá, {DRIVER.firstName}</h1>
            </div>
          </div>
          <Image src="/icons/logo-360.png" alt="GoTransfer" width={40} height={38} />
        </div>

        <div className="flex items-center justify-between gap-3 rounded-[18px] bg-brand-850 px-4 py-3.5">
          <div>
            <p className="flex items-center gap-2 text-base font-bold">
              <span aria-hidden className={`size-2.5 rounded-full ${online ? "bg-mint" : "bg-on-dark-muted"}`} />
              {online ? "Disponível" : "Indisponível"}
            </p>
            <p className="text-[13px] text-on-dark">
              {online ? "Recebendo ofertas na sua região" : "Você não recebe novas ofertas"}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={online}
            aria-label="Disponível para ofertas"
            onClick={() => setOnline(!online)}
            className={`flex h-8 w-14 shrink-0 items-center rounded-full p-[3px] transition-colors ${
              online ? "justify-end bg-mint" : "justify-start bg-brand-820"
            }`}
          >
            <span className="size-[26px] rounded-full bg-white shadow" />
          </button>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
        <div className="grid grid-cols-3 gap-2.5">
          <Stat value={String(today.length)} label="serviços hoje" />
          <Stat value={formatMoney(today.reduce((sum, s) => sum + s.payoutCents, 0)).replace(",00", "")} label="hoje" />
          <Stat value={DRIVER.rating} label="avaliação" />
        </div>

        {firstOffer ? (
          <Link
            href="/motorista/ofertas"
            className="flex items-center gap-3 rounded-2xl border border-[#FBD3B4] bg-accent-50 px-4 py-3.5"
          >
            <span aria-hidden className="grid size-10 place-items-center rounded-xl bg-accent-700 text-white">
              <Icon name="bell" size={22} />
            </span>
            <span className="flex flex-1 flex-col">
              <span className="text-[15px] font-bold">
                {offers.length} {offers.length === 1 ? "nova oferta" : "novas ofertas"}
              </span>
              <span className="text-[13px] text-accent-800">
                A primeira expira em {formatCountdown(secondsLeft(firstOffer, now))}
              </span>
            </span>
            <Icon name="chevronRight" size={20} strokeWidth={2} className="text-accent-800" />
          </Link>
        ) : null}

        <section className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-lg font-extrabold">Próximo serviço</h2>
            {next ? <span className="text-[13px] font-semibold text-success-700">{relativeStart(next.dayOffset, next.time, new Date())}</span> : null}
          </div>
          {next ? (
            <article className="flex flex-col gap-3.5 rounded-[20px] border border-line bg-surface p-4.5 shadow-(--shadow-card)">
              <div className="flex items-center justify-between">
                <KindChip service={next} />
                <span className="font-display text-[22px] font-extrabold">{next.time}</span>
              </div>
              <RouteLine
                from={{ title: next.pickup.title, detail: next.flight ? `Voo ${next.flight.number} · ${next.flight.info}` : next.pickup.detail }}
                to={next.dropoff}
              />
              <div className="flex items-center justify-between border-t border-canvas pt-3">
                <span className="flex gap-3.5 text-[13px] text-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <Icon name="users" size={16} /> {next.passenger.count} pass.
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Icon name="luggage" size={16} /> {next.luggage.large + next.luggage.medium} malas
                  </span>
                </span>
                <span className="font-display text-lg font-extrabold text-success-700">{formatMoney(next.payoutCents)}</span>
              </div>
              <Link
                href={`/motorista/servico/${next.id}`}
                className="flex h-12.5 items-center justify-center rounded-[14px] bg-brand-800 text-[15px] font-bold text-white hover:bg-brand-700"
              >
                {next.step === "assigned" ? "Ver serviço" : "Continuar serviço"}
              </Link>
            </article>
          ) : (
            <div className="rounded-[20px] border border-dashed border-line bg-surface px-5 py-8 text-center">
              <p className="font-bold">Nenhum serviço pendente</p>
              <p className="mt-1 text-sm text-muted">
                {online ? "Assim que surgir uma oferta, ela aparece aqui." : "Fique disponível para receber ofertas."}
              </p>
            </div>
          )}
        </section>
      </main>
      <BottomNav />
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-line bg-surface px-3 py-3.5">
      <p className="font-display text-[21px] font-extrabold tabular-nums">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}
