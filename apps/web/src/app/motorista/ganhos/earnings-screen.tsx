"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { EARNINGS, EARNING_ITEMS, formatMoney, type EarningItem, type EarningsPeriod } from "@/lib/driver/mock";
import { useDriver } from "../driver-store";
import { BottomNav } from "../ui";

const PERIODS: Array<{ id: EarningsPeriod; label: string }> = [
  { id: "day", label: "Dia" },
  { id: "week", label: "Semana" },
  { id: "month", label: "Mês" },
];

const STATUS: Record<EarningItem["status"], { label: string; className: string }> = {
  paid: { label: "Pago", className: "bg-success-50 text-success-700" },
  pending: { label: "A receber", className: "bg-brand-100/70 text-brand-800" },
  held: { label: "Retido", className: "bg-warning-50 text-warning-700" },
};

export function EarningsScreen() {
  const { notify } = useDriver();
  const [period, setPeriod] = useState<EarningsPeriod>("week");
  const data = EARNINGS[period];
  const total = data.paid + data.pending + data.held;
  const max = Math.max(...data.bars, 1);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-col gap-3.5 bg-brand-900 px-5 pb-5 pt-4 text-white">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-[26px] font-extrabold">Ganhos</h1>
          <div role="group" aria-label="Período" className="flex rounded-full bg-brand-850 p-[3px]">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={period === p.id}
                onClick={() => setPeriod(p.id)}
                className={`h-8.5 rounded-full px-3 text-[13px] ${
                  period === p.id ? "bg-white font-bold text-brand-900" : "font-semibold text-on-dark"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[13px] text-on-dark">
            {data.label} · {data.count} {data.count === 1 ? "serviço" : "serviços"}
          </p>
          <p className="mt-1 font-display text-[38px] font-extrabold tracking-tight tabular-nums">{formatMoney(total)}</p>
        </div>
        <div aria-hidden className="flex h-21 items-end gap-2">
          {data.bars.map((value, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
              <span
                className={`w-full rounded-md ${i === data.bars.length - 2 && period === "week" ? "bg-accent-300" : "bg-[#3A5BD9]"}`}
                style={{ height: `${Math.max(4, Math.round((value / max) * 62))}px` }}
              />
              <span className="text-[11px] text-on-dark">{data.barLabels[i]}</span>
            </div>
          ))}
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-5 py-4">
        <div className="grid grid-cols-3 gap-2">
          <Bucket label="Pago" tone="text-success-700" cents={data.paid} />
          <Bucket label="A receber" tone="text-brand-800" cents={data.pending} />
          <Bucket label="Retido" tone="text-warning-700" cents={data.held} />
        </div>

        <div className="flex items-center gap-3 rounded-2xl bg-brand-100/60 px-4 py-3.5">
          <Icon name="calendar" size={22} className="text-brand-800" />
          <div>
            <p className="text-sm font-bold">Próximo repasse: terça-feira</p>
            <p className="mt-0.5 text-[13px] text-muted">{formatMoney(data.pending)} · para a sua transportadora</p>
          </div>
        </div>

        <h2 className="mt-1 font-display text-[17px] font-extrabold">Serviços recentes</h2>
        <ul className="overflow-hidden rounded-[18px] border border-line bg-surface">
          {EARNING_ITEMS.map((item, i) => (
            <li key={item.title} className={`flex items-center gap-3 px-4 py-3 ${i < EARNING_ITEMS.length - 1 ? "border-b border-canvas" : ""}`}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{item.title}</p>
                <p className="mt-0.5 text-xs text-muted">{item.when}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="text-sm font-extrabold tabular-nums">{formatMoney(item.cents)}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS[item.status].className}`}>{STATUS[item.status].label}</span>
              </div>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => notify("Na versão final, abre um chamado com o suporte financeiro.")}
          className="self-start text-sm font-semibold text-brand-600"
        >
          Algum valor está errado? Fale com o suporte
        </button>
      </main>
      <BottomNav />
    </div>
  );
}

function Bucket({ label, tone, cents }: { label: string; tone: string; cents: number }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-line bg-surface p-3">
      <span className={`text-xs font-semibold ${tone}`}>{label}</span>
      <span className="text-[15px] font-extrabold tabular-nums">{formatMoney(cents)}</span>
    </div>
  );
}
