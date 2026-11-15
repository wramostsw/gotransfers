"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/icons";
import { ADMIN_NAV_GROUPS, type AdminNavItem } from "./nav-config";

type Counters = { approvals?: number };

function isActive(pathname: string, href: string) {
  if (href === "#") return false;
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavList({ counters, onNavigate }: { counters: Counters; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <div className="flex flex-col gap-5">
      {ADMIN_NAV_GROUPS.map((group) => (
        <div key={group.title} className="flex flex-col gap-0.5">
          <p className="mb-1 px-2.5 text-[11px] font-bold uppercase tracking-wider text-[#8FA2D6]">{group.title}</p>
          {group.items.map((item) => (
            <NavLink key={item.label} item={item} active={isActive(pathname, item.href)} counters={counters} onNavigate={onNavigate} />
          ))}
        </div>
      ))}
    </div>
  );
}

function NavLink({
  item,
  active,
  counters,
  onNavigate,
}: {
  item: AdminNavItem;
  active: boolean;
  counters: Counters;
  onNavigate?: () => void;
}) {
  const count = item.counter ? (counters[item.counter] ?? 0) : 0;
  const base = "flex min-h-9.5 items-center gap-2.5 rounded-[10px] px-2.5 text-sm";
  if (item.phase) {
    return (
      <span className={`${base} cursor-default font-medium text-[#8FA2D6]`} title={`Disponível na ${item.phase} do roadmap`}>
        <Icon name={item.icon} size={18} />
        <span className="flex-1">{item.label}</span>
        <span className="rounded-full bg-[#0E1B5C] px-1.5 py-0.5 text-[10px] font-bold text-[#9FB0DC]">{item.phase}</span>
      </span>
    );
  }
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`${base} ${
        active
          ? "bg-brand-850 font-semibold text-white shadow-[inset_3px_0_0_#FEC804]"
          : "font-medium text-on-dark hover:bg-white/5 hover:text-white"
      }`}
    >
      <Icon name={item.icon} size={18} />
      <span className="flex-1">{item.label}</span>
      {count > 0 ? (
        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent-700 px-1.5 text-[11px] font-bold text-white">
          {count}
          <span className="sr-only"> pendentes</span>
        </span>
      ) : null}
    </Link>
  );
}

function Brand() {
  return (
    <Link href="/admin" className="flex items-center gap-2.5 px-2">
      <Image src="/icons/logo-360.png" alt="" width={34} height={32} />
      <span className="flex flex-col">
        <span className="font-display text-base font-extrabold text-white">GoTransfer</span>
        <span className="text-[11px] font-semibold tracking-wider text-[#9FB0DC]">ADMIN MASTER</span>
      </span>
    </Link>
  );
}

/** Menu lateral fixo no computador. */
export function AdminSidebar({ counters = {} }: { counters?: Counters }) {
  return (
    <nav
      aria-label="Menu principal"
      className="sticky top-0 hidden h-dvh w-66 shrink-0 flex-col gap-5 overflow-y-auto bg-brand-950 px-3.5 pb-6 pt-5 lg:flex"
    >
      <Brand />
      <NavList counters={counters} />
    </nav>
  );
}

/** Botão e gaveta do menu para celular e tablet. */
export function AdminMobileNav({ counters = {} }: { counters?: Counters }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Abrir menu"
        aria-expanded={open}
        className="grid size-10 place-items-center rounded-[10px] border border-line text-ink lg:hidden"
      >
        <Icon name="menu" size={20} />
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <nav className="flex h-full w-72 flex-col gap-5 overflow-y-auto bg-brand-950 px-3.5 pb-6 pt-5">
            <div className="flex items-center justify-between">
              <Brand />
              <button type="button" onClick={() => setOpen(false)} aria-label="Fechar menu" className="grid size-10 place-items-center rounded-[10px] text-white">
                <Icon name="x" size={20} />
              </button>
            </div>
            <NavList counters={counters} onNavigate={() => setOpen(false)} />
          </nav>
          <button type="button" aria-label="Fechar menu" className="flex-1 bg-ink/50" onClick={() => setOpen(false)} />
        </div>
      ) : null}
    </>
  );
}
