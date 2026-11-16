"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons";
import { KIND_LABEL, type DriverService } from "@/lib/driver/mock";
import { useDriver } from "./driver-store";

const TABS: Array<{ href: string; label: string; icon: IconName }> = [
  { href: "/motorista", label: "Início", icon: "home" },
  { href: "/motorista/ofertas", label: "Ofertas", icon: "bell" },
  { href: "/motorista/agenda", label: "Agenda", icon: "calendar" },
  { href: "/motorista/ganhos", label: "Ganhos", icon: "wallet" },
  { href: "/motorista/perfil", label: "Perfil", icon: "user" },
];

export function BottomNav() {
  const pathname = usePathname();
  const { offers } = useDriver();
  return (
    <nav
      aria-label="Navegação principal"
      className="flex justify-around border-t border-line bg-surface px-1.5 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-2"
    >
      {TABS.map((tab) => {
        const active = tab.href === "/motorista" ? pathname === "/motorista" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`relative flex h-13 w-17 flex-col items-center justify-center gap-1 rounded-xl text-xs ${
              active ? "font-bold text-brand-800" : "font-semibold text-muted"
            }`}
          >
            <Icon name={tab.icon} />
            {tab.label}
            {tab.icon === "bell" && offers.length > 0 ? (
              <span className="absolute right-3 top-0.5 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-accent-700 px-1 text-[11px] font-bold text-white">
                {offers.length}
                <span className="sr-only"> ofertas abertas</span>
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

/** Tela com conteúdo rolável e o menu inferior fixo. */
export function TabScreen({ header, children }: { header?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}
      <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">{children}</main>
      <BottomNav />
    </div>
  );
}

export function ScreenTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-line bg-surface px-5 pb-3.5 pt-4">
      <h1 className="font-display text-[26px] font-extrabold tracking-tight">{children}</h1>
      {aside}
    </header>
  );
}

export function BackHeader({ href, title, subtitle }: { href: string; title: string; subtitle?: string }) {
  return (
    <header className="flex items-center gap-3 border-b border-line bg-surface px-4 pb-3.5 pt-3">
      <Link href={href} aria-label="Voltar" className="grid size-11 place-items-center rounded-xl text-ink hover:bg-canvas">
        <Icon name="back" strokeWidth={2.2} />
      </Link>
      <div className="min-w-0">
        <h1 className="truncate font-display text-xl font-extrabold">{title}</h1>
        {subtitle ? <p className="truncate text-[13px] text-muted">{subtitle}</p> : null}
      </div>
    </header>
  );
}

export function KindChip({ service, withDay }: { service: DriverService; withDay?: boolean }) {
  const tone =
    service.kind === "bus_station" ? "bg-accent-50 text-accent-800" : "bg-brand-100/70 text-brand-800";
  const icon: IconName = service.kind === "bus_station" ? "bus" : service.kind === "point_to_point" ? "pin" : "plane";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${tone}`}>
      <Icon name={icon} size={14} strokeWidth={2} />
      {KIND_LABEL[service.kind]}
      {withDay ? ` · ${dayLabel(service.dayOffset)}` : ""}
    </span>
  );
}

export function dayLabel(offset: number) {
  if (offset === 0) return "hoje";
  if (offset === 1) return "amanhã";
  return `em ${offset} dias`;
}

/** Linha origem → destino com marcadores. */
export function RouteLine({
  from,
  to,
  dark = false,
}: {
  from: { title: string; detail?: string };
  to: { title: string; detail?: string };
  dark?: boolean;
}) {
  const detail = dark ? "text-on-dark" : "text-muted";
  return (
    <div className="flex gap-3">
      <div aria-hidden className="flex flex-col items-center pt-1.5">
        <span className="size-2.5 rounded-full border-[3px] border-brand-600 bg-surface" />
        <span className="my-1 w-0.5 flex-1 bg-line" />
        <span className="size-2.5 rounded-[3px] bg-accent-700" />
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        <div>
          <p className="text-[15px] font-bold">
            <span className="sr-only">Embarque: </span>
            {from.title}
          </p>
          {from.detail ? <p className={`mt-0.5 text-[13px] ${detail}`}>{from.detail}</p> : null}
        </div>
        <div>
          <p className="text-[15px] font-bold">
            <span className="sr-only">Destino: </span>
            {to.title}
          </p>
          {to.detail ? <p className={`mt-0.5 text-[13px] ${detail}`}>{to.detail}</p> : null}
        </div>
      </div>
    </div>
  );
}

export function Tag({ children }: { children: ReactNode }) {
  return <span className="rounded-[10px] bg-canvas px-2.5 py-1.5 text-[13px] font-semibold">{children}</span>;
}

/** Ilustração de mapa (o mapa real entra com a integração de mapas). */
export function MapArt({ dark = false, className = "" }: { dark?: boolean; className?: string }) {
  const bg = dark ? "#0B1A55" : "#E4EAF4";
  const road = dark ? "#1C2E73" : "#FFFFFF";
  const minor = dark ? "#15276A" : "#F4F6FB";
  const route = dark ? "#FEC804" : "#004AD0";
  return (
    <svg viewBox="0 0 390 300" preserveAspectRatio="xMidYMid slice" aria-hidden className={className}>
      <rect width="390" height="300" fill={bg} />
      <path d="M-10 80 L400 60" stroke={road} strokeWidth="15" />
      <path d="M-10 230 L400 260" stroke={road} strokeWidth="15" />
      <path d="M110 -10 L140 310" stroke={road} strokeWidth="13" />
      <path d="M290 -10 L260 310" stroke={road} strokeWidth="13" />
      <path d="M-10 155 L400 157" stroke={minor} strokeWidth="7" />
      {!dark ? <rect x="160" y="95" width="70" height="36" rx="6" fill="#D3EBDC" /> : null}
      <path d="M90 270 C 140 210, 190 190, 230 165 S 300 100, 318 66" fill="none" stroke={route} strokeWidth="7" strokeLinecap="round" />
      <circle cx="90" cy="270" r="10" fill={dark ? "#FEC804" : "#FFFFFF"} stroke={dark ? "#000B45" : route} strokeWidth="5" />
      <rect x="306" y="54" width="24" height="24" rx="7" fill="#C2410C" stroke={dark ? "#000B45" : "#FFFFFF"} strokeWidth="3" />
    </svg>
  );
}
