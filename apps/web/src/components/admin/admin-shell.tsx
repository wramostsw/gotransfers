import { Suspense, type ReactNode } from "react";
import { signOut } from "@/app/(auth)/actions";
import { Icon } from "@/components/icons";
import { getSessionContext } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { AdminMobileNav, AdminSidebar } from "./sidebar";

async function pendingApprovals() {
  const supabase = await createClient();
  const [{ count: drivers }, { count: vehicles }] = await Promise.all([
    supabase.from("drivers").select("id", { count: "exact", head: true }).eq("approval_status", "pending"),
    supabase.from("vehicles").select("id", { count: "exact", head: true }).eq("approval_status", "pending"),
  ]);
  return (drivers ?? 0) + (vehicles ?? 0);
}

async function SidebarWithCounts() {
  const approvals = await pendingApprovals();
  return <AdminSidebar counters={{ approvals }} />;
}

async function MobileNavWithCounts() {
  const approvals = await pendingApprovals();
  return <AdminMobileNav counters={{ approvals }} />;
}

async function UserMenu() {
  const session = await getSessionContext();
  if (!session) return null;
  const platform = session.memberships.find((m) => m.organization.type === "platform");
  const initials = session.fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-11 items-center gap-2.5 rounded-xl border border-line bg-surface pl-1.5 pr-3">
        <span aria-hidden className="grid size-8 place-items-center rounded-full bg-accent-300 text-[13px] font-extrabold text-brand-900">
          {initials || "?"}
        </span>
        <span className="hidden flex-col leading-tight sm:flex">
          <span className="max-w-40 truncate text-[13px] font-bold">{session.fullName}</span>
          <span className="text-[11px] text-muted">{platform ? `GoTransfer · ${ROLE_LABEL[platform.role]}` : session.email}</span>
        </span>
      </div>
      <form action={signOut}>
        <button aria-label="Sair" title="Sair" className="grid size-11 place-items-center rounded-xl border border-line bg-surface text-muted hover:text-danger-700">
          <Icon name="logout" size={18} />
        </button>
      </form>
    </div>
  );
}

/** Moldura do Admin Master: menu lateral, barra superior e área de conteúdo. */
export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh bg-[#F5F7FB]">
      <Suspense fallback={<div aria-hidden className="sticky top-0 hidden h-dvh w-66 shrink-0 bg-brand-950 lg:block" />}>
        <SidebarWithCounts />
      </Suspense>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex flex-wrap items-center gap-3 border-b border-line bg-surface px-4 py-2.5 pt-[max(env(safe-area-inset-top),0.625rem)] sm:px-7">
          <Suspense fallback={<div aria-hidden className="size-10 rounded-[10px] border border-line lg:hidden" />}>
            <MobileNavWithCounts />
          </Suspense>
          <form action="/admin/organizacoes" className="flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-[10px] border border-line bg-[#F5F7FB] px-3 text-muted sm:max-w-96">
            <Icon name="search" size={18} />
            <label htmlFor="admin-search" className="sr-only">
              Buscar organização
            </label>
            <input
              id="admin-search"
              name="q"
              type="search"
              placeholder="Buscar empresa, CNPJ ou responsável"
              className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted"
            />
          </form>
          <span className="ml-auto hidden rounded-full bg-success-50 px-2.5 py-1 text-xs font-bold text-success-700 md:inline">Produção</span>
          <Suspense fallback={<div className="h-11 w-44 animate-pulse rounded-xl bg-line/70" />}>
            <UserMenu />
          </Suspense>
        </header>
        <main className="mx-auto flex w-full max-w-[1240px] flex-1 flex-col gap-5 px-4 py-6 sm:px-7 sm:py-7">{children}</main>
      </div>
    </div>
  );
}
