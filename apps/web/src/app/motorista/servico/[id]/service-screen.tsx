"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { formatMoney } from "@/lib/driver/mock";
import { useDriver } from "../../driver-store";
import { MapArt, dayLabel } from "../../ui";

export function ServiceScreen() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { services, advanceStep, notify } = useDriver();
  const s = services.find((x) => x.id === id);

  if (!s) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-lg font-bold">Serviço não encontrado</p>
        <Link href="/motorista/agenda" className="font-semibold text-brand-600">
          Ver agenda
        </Link>
      </div>
    );
  }

  const done = s.step === "completed";
  const started = s.step !== "assigned" && !done;

  function start() {
    if (s!.step === "assigned") advanceStep(s!.id);
    router.push(`/motorista/servico/${s!.id}/execucao`);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative h-48 shrink-0 overflow-hidden">
        <MapArt className="absolute inset-0 size-full" />
        <Link
          href="/motorista/agenda"
          aria-label="Voltar"
          className="absolute left-4 top-3 grid size-11 place-items-center rounded-full bg-surface shadow-lg"
        >
          <Icon name="back" size={22} strokeWidth={2.2} />
        </Link>
        <span className="absolute right-4 top-5 rounded-full bg-surface px-3 py-1.5 text-xs font-bold shadow-lg">
          {s.distanceKm} km · cerca de {s.durationMin} min
        </span>
      </div>

      <main className="relative -mt-6 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto rounded-t-3xl bg-canvas px-5 pb-[max(env(safe-area-inset-bottom),1rem)] pt-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[13px] font-semibold text-muted">
              Serviço {s.code} · {done ? "Concluído" : started ? "Em andamento" : "Atribuído"}
            </p>
            <h1 className="mt-0.5 font-display text-[22px] font-extrabold capitalize">
              {dayLabel(s.dayOffset)}, {s.time}
            </h1>
          </div>
          <span className="font-display text-xl font-extrabold text-success-700">{formatMoney(s.payoutCents)}</span>
        </div>

        <section className="flex flex-col gap-3 rounded-[18px] border border-line bg-surface p-4">
          <div className="flex gap-3">
            <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-brand-100/70 text-brand-800">
              <Icon name={s.kind === "bus_station" ? "bus" : "plane"} size={20} />
            </span>
            <div>
              <p className="text-[15px] font-bold">Embarque · {s.pickup.title}</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
                {s.flight ? `Voo ${s.flight.number} · ${s.flight.info}. ` : ""}
                {s.pickup.meetingPoint ?? s.pickup.detail}
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-accent-50 text-accent-700">
              <Icon name="pin" size={20} />
            </span>
            <div>
              <p className="text-[15px] font-bold">Destino · {s.dropoff.title}</p>
              <p className="mt-0.5 text-[13px] text-muted">{s.dropoff.detail}</p>
            </div>
          </div>
        </section>

        <section className="flex items-center gap-3 rounded-[18px] border border-line bg-surface px-4 py-3.5">
          <div aria-hidden className="grid size-10.5 place-items-center rounded-full bg-brand-100/70 font-extrabold text-brand-800">
            {s.passenger.initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-bold">
              {s.passenger.name}
              {s.passenger.count > 1 ? ` + ${s.passenger.count - 1}` : ""}
            </p>
            <p className="mt-0.5 text-[13px] text-muted">
              {s.passenger.language ? `${s.passenger.language} · ` : ""}
              {s.luggage.large} {s.luggage.large === 1 ? "mala grande" : "malas grandes"}
              {s.luggage.medium ? `, ${s.luggage.medium} média` : ""}
            </p>
          </div>
          {!done ? (
            <>
              <button
                type="button"
                onClick={() => notify("Na versão final, abre a conversa com o passageiro.")}
                aria-label="Enviar mensagem ao passageiro"
                className="grid size-11 place-items-center rounded-xl border border-line text-brand-800"
              >
                <Icon name="chat" size={20} />
              </button>
              <button
                type="button"
                onClick={() => notify("Na versão final, a ligação passa por um número protegido.")}
                aria-label="Ligar para o passageiro"
                className="grid size-11 place-items-center rounded-xl border border-line text-brand-800"
              >
                <Icon name="phone" size={20} />
              </button>
            </>
          ) : null}
        </section>

        {s.agencyNote ? (
          <section className="rounded-[18px] border border-[#F5DE9A] bg-[#FFF8E1] px-4 py-3.5">
            <p className="text-[13px] font-bold text-[#6B4700]">Observação da agência</p>
            <p className="mt-1 text-[13px] leading-relaxed text-[#4A3500]">{s.agencyNote}</p>
          </section>
        ) : null}

        {done ? (
          <p className="mt-auto flex items-center justify-center gap-2 rounded-2xl bg-success-50 py-4 text-[15px] font-bold text-success-700">
            <Icon name="check" size={20} strokeWidth={2.4} /> Serviço concluído
          </p>
        ) : (
          <div className="mt-auto flex gap-2.5 pt-1">
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.pickup.title)}`}
              target="_blank"
              rel="noreferrer"
              aria-label="Abrir navegação até o embarque"
              className="grid size-14 shrink-0 place-items-center rounded-2xl border border-line bg-surface text-brand-800"
            >
              <Icon name="navigate" />
            </a>
            <button
              type="button"
              onClick={start}
              className="h-14 flex-1 rounded-2xl bg-brand-800 text-base font-bold text-white hover:bg-brand-700"
            >
              {started ? "Continuar serviço" : "Iniciar deslocamento"}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
