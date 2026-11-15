"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { STEP_ORDER, formatMoney, type DriverService, type Step } from "@/lib/driver/mock";
import { useDriver } from "../../../driver-store";
import { addMinutes } from "../../../time";
import { MapArt } from "../../../ui";

const SEGMENTS = ["A caminho", "Chegou", "Embarque", "Em viagem", "Concluído"];

function stage(s: DriverService): { eyebrow: string; title: string; detail: string; action: string } {
  const pickup = s.pickup.title.split(" · ")[0];
  const bags = s.luggage.large + s.luggage.medium;
  const table: Record<Exclude<Step, "completed">, { eyebrow: string; title: string; detail: string; action: string }> = {
    assigned: { eyebrow: "SERVIÇO ATRIBUÍDO", title: `Embarque às ${s.time}`, detail: s.pickup.title, action: "Iniciar deslocamento" },
    en_route: {
      eyebrow: "A CAMINHO DO EMBARQUE",
      title: `Chegada ${addMinutes(s.time, -28)}`,
      detail: `${pickup}${s.flight ? ` · voo ${s.flight.number}` : ""}`,
      action: "Cheguei ao embarque",
    },
    arrived: {
      eyebrow: "NO PONTO DE EMBARQUE",
      title: "Aguardando passageiro",
      detail: `Tolerância de ${s.toleranceMin} min · ${s.pickup.meetingPoint ?? pickup}`,
      action: "Passageiro embarcou",
    },
    boarding: {
      eyebrow: "EMBARQUE",
      title: "Confira passageiros e malas",
      detail: `${s.passenger.count} ${s.passenger.count === 1 ? "passageiro" : "passageiros"} · ${bags} malas`,
      action: "Iniciar viagem",
    },
    in_progress: {
      eyebrow: "EM VIAGEM",
      title: `Chegada ${addMinutes(s.time, s.durationMin)}`,
      detail: `${s.dropoff.title} · ${s.distanceKm} km`,
      action: "Finalizar serviço",
    },
  };
  return table[s.step as Exclude<Step, "completed">];
}

export function ExecutionScreen() {
  const { id } = useParams<{ id: string }>();
  const { services, advanceStep, incidents, notify } = useDriver();
  const s = services.find((x) => x.id === id);
  // Trava curta após cada etapa: um toque duplo acidental não pode pular etapas.
  const [cooling, setCooling] = useState(false);
  useEffect(() => {
    if (!cooling) return;
    const timer = setTimeout(() => setCooling(false), 1500);
    return () => clearTimeout(timer);
  }, [cooling]);

  if (!s) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-brand-900 px-6 text-center text-white">
        <p className="text-lg font-bold">Serviço não encontrado</p>
        <Link href="/motorista" className="font-semibold text-accent-300">
          Voltar ao início
        </Link>
      </div>
    );
  }

  if (s.step === "completed") return <Completed service={s} />;

  const index = STEP_ORDER.indexOf(s.step);
  const info = stage(s);
  const tracking = s.step !== "assigned";
  const destination = s.step === "in_progress" ? s.dropoff.title : s.pickup.title;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-brand-950 text-white">
      <div className="relative h-[38%] min-h-56 shrink-0 overflow-hidden">
        <MapArt dark className="absolute inset-0 size-full" />
        <div className="absolute inset-x-4 top-3 flex items-center justify-between gap-2.5">
          <Link href={`/motorista/servico/${s.id}`} aria-label="Voltar ao detalhe" className="grid size-11 place-items-center rounded-full bg-brand-950/85">
            <Icon name="back" size={22} strokeWidth={2.2} />
          </Link>
          <span className="inline-flex items-center gap-2 rounded-full bg-brand-950/85 px-3 py-2 text-xs font-semibold text-on-dark">
            <span aria-hidden className={`size-2 rounded-full ${tracking ? "bg-mint" : "bg-on-dark-muted"}`} />
            {tracking ? "Localização compartilhada" : "Localização desligada"}
          </span>
          <button
            type="button"
            onClick={() => notify("Na versão final, este botão liga para a central GoTransfer.")}
            aria-label="Ligar para a central GoTransfer"
            className="grid size-11 place-items-center rounded-full bg-brand-950/85"
          >
            <Icon name="phone" size={20} />
          </button>
        </div>
      </div>

      <main className="relative -mt-6 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto rounded-t-[26px] bg-brand-900 px-5 pb-[max(env(safe-area-inset-bottom),1.25rem)] pt-5">
        <div className="flex items-start justify-between gap-3">
          <div aria-live="polite">
            <p className="text-[13px] font-bold tracking-wide text-accent-300">{info.eyebrow}</p>
            <h1 className="mt-1 font-display text-[28px] font-extrabold leading-tight">{info.title}</h1>
            <p className="mt-1.5 text-[15px] text-on-dark">{info.detail}</p>
          </div>
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`}
            target="_blank"
            rel="noreferrer"
            aria-label="Abrir navegação"
            className="grid size-14 shrink-0 place-items-center rounded-2xl bg-brand-850"
          >
            <Icon name="navigate" size={26} />
          </a>
        </div>

        <ol aria-label="Etapas do serviço" className="grid grid-cols-5 gap-1.5">
          {SEGMENTS.map((label, i) => {
            const done = index - 1 >= i;
            return (
              <li key={label} className="flex flex-col gap-1.5" aria-current={index - 1 === i ? "step" : undefined}>
                <span className={`h-1.5 rounded-full ${done ? "bg-accent-300" : "bg-brand-820"}`} />
                <span className={`text-[11px] ${done ? "font-bold text-white" : "font-semibold text-on-dark-muted"}`}>{label}</span>
              </li>
            );
          })}
        </ol>

        <div className="flex items-center gap-3 rounded-[18px] bg-brand-850 px-4 py-3.5">
          <div aria-hidden className="grid size-10.5 place-items-center rounded-full bg-accent-300 font-extrabold text-brand-900">
            {s.passenger.initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-bold">
              {s.passenger.name}
              {s.passenger.count > 1 ? ` + ${s.passenger.count - 1}` : ""}
            </p>
            <p className="mt-0.5 truncate text-[13px] text-on-dark">
              {s.step === "in_progress" ? `Destino: ${s.dropoff.title}` : (s.pickup.meetingPoint ?? s.pickup.detail)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => notify("Na versão final, a ligação passa por um número protegido, sem expor seu telefone.")}
            aria-label="Ligar para o passageiro"
            className="grid size-11 place-items-center rounded-xl bg-brand-820"
          >
            <Icon name="phone" size={20} />
          </button>
        </div>

        {incidents[s.id] ? (
          <p className="rounded-2xl bg-warning-50 px-4 py-3 text-sm font-semibold text-warning-700">
            Ocorrência “{incidents[s.id]}” enviada. A central está acompanhando.
          </p>
        ) : null}

        <div className="mt-auto flex flex-col gap-3">
          <button
            type="button"
            disabled={cooling}
            onClick={() => {
              advanceStep(s.id);
              setCooling(true);
            }}
            className="h-16 rounded-[18px] bg-accent-300 font-display text-lg font-extrabold text-brand-900 transition-opacity hover:bg-[#FFD84D] disabled:opacity-50"
          >
            {cooling ? "Registrado ✓" : info.action}
          </button>
          <p className="text-center text-xs text-on-dark-muted">Por segurança, use os botões só com o carro parado.</p>
          <Link
            href={`/motorista/servico/${s.id}/ocorrencia`}
            className="flex h-12 items-center justify-center gap-2 rounded-[14px] border border-brand-820 text-[15px] font-semibold"
          >
            <Icon name="alert" size={18} />
            Registrar ocorrência
          </Link>
        </div>
      </main>
    </div>
  );
}

function Completed({ service: s }: { service: DriverService }) {
  return (
    <main className="flex min-h-0 flex-1 flex-col items-center gap-5 overflow-y-auto bg-brand-900 px-6 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-16 text-center text-white">
      <div className="grid size-24 place-items-center rounded-full bg-brand-850">
        <div className="grid size-17 place-items-center rounded-full bg-mint text-brand-900">
          <Icon name="check" size={36} strokeWidth={2.6} />
        </div>
      </div>
      <h1 role="status" className="font-display text-[26px] font-extrabold">
        Serviço concluído
      </h1>
      <p className="max-w-72 text-[15px] leading-relaxed text-on-dark">
        {s.pickup.title.split(" · ")[0]} → {s.dropoff.title}
      </p>
      <div className="w-full rounded-[20px] bg-brand-850 px-5 py-4">
        <p className="text-[13px] text-on-dark">Você recebe</p>
        <p className="font-display text-3xl font-extrabold text-mint">{formatMoney(s.payoutCents)}</p>
        <p className="mt-1 text-xs text-on-dark-muted">Entra em “a receber” depois da validação do serviço.</p>
      </div>
      <Link
        href="/motorista"
        className="mt-auto flex h-14 w-full items-center justify-center rounded-2xl bg-accent-300 text-base font-extrabold text-brand-900"
      >
        Voltar ao início
      </Link>
    </main>
  );
}
