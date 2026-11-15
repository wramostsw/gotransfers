import Image from "next/image";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { signOut } from "@/app/(auth)/actions";
import { getSessionContext } from "@/lib/auth";
import { Skeleton } from "@/components/ui";

export type NavItem = { href: string; label: string };

async function UserMenu() {
  const session = await getSessionContext();
  if (!session) return null;
  return (
    <div className="flex items-center gap-3">
      <span className="hidden max-w-48 truncate text-sm text-white/85 sm:block">{session.fullName}</span>
      <form action={signOut}>
        <button className="min-h-9 rounded-lg border border-white/25 px-3 text-sm font-semibold text-white hover:bg-white/10">
          Sair
        </button>
      </form>
    </div>
  );
}

/** Moldura das áreas autenticadas: cabeçalho da marca, navegação e conteúdo. */
export function AppShell({
  area,
  nav = [],
  children,
}: {
  area: string;
  nav?: NavItem[];
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-brand-900 pt-[env(safe-area-inset-top)] text-white">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/inicio" className="flex items-center gap-3">
            <Image src="/icons/logo-360.png" alt="" width={36} height={34} priority />
            <span className="flex flex-col leading-tight">
              <span className="text-base font-bold">GoTransfer</span>
              <span className="text-xs text-white/70">{area}</span>
            </span>
          </Link>
          <Suspense fallback={<Skeleton className="h-9 w-20 bg-white/15" />}>
            <UserMenu />
          </Suspense>
        </div>
        {nav.length > 0 ? (
          <nav aria-label={area} className="mx-auto flex w-full max-w-6xl gap-1 overflow-x-auto px-2 sm:px-4">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="whitespace-nowrap rounded-t-lg px-3 py-2.5 text-sm font-semibold text-white/80 hover:bg-white/10 hover:text-white"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        ) : null}
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-[calc(env(safe-area-inset-bottom)+2rem)] sm:px-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-28 w-full" />
    </div>
  );
}
