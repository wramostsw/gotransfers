import Image from "next/image";
import Link from "next/link";
import { buttonClass } from "@/components/ui";

// Quem já tem sessão é levado para /inicio pelo proxy; aqui fica a porta de entrada.
export default function HomePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-between bg-brand-900 bg-[radial-gradient(120%_70%_at_50%_0%,var(--color-brand-600)_0%,var(--color-brand-800)_45%,var(--color-brand-900)_100%)] px-6 pb-[calc(env(safe-area-inset-bottom)+2.5rem)] pt-[calc(env(safe-area-inset-top)+18vh)] text-center text-white">
      <div className="flex flex-col items-center gap-4">
        <Image src="/icons/logo-360.png" alt="Logo GoTransfer" width={168} height={160} priority className="drop-shadow-2xl" />
        <h1 className="mt-2 text-4xl font-bold tracking-tight">GoTransfer</h1>
        <p className="max-w-xs text-base text-white/75">Sua agência vende. Nós conectamos o transporte.</p>
      </div>
      <div className="flex w-full max-w-sm flex-col gap-3">
        <Link href="/entrar" className={buttonClass("accent")}>
          Entrar
        </Link>
        <Link href="/cadastro" className={`${buttonClass("ghost")} text-white hover:bg-white/10`}>
          Criar conta
        </Link>
      </div>
    </main>
  );
}
