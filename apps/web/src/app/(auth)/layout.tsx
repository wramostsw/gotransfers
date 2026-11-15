import Image from "next/image";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col bg-brand-900 bg-[radial-gradient(120%_70%_at_50%_0%,var(--color-brand-600)_0%,var(--color-brand-800)_45%,var(--color-brand-900)_100%)] lg:flex-row">
      <div className="flex flex-col items-center gap-3 px-6 pb-8 pt-[calc(env(safe-area-inset-top)+3rem)] text-center text-white lg:flex-1 lg:justify-center lg:pb-0 lg:pt-0">
        <Image src="/icons/logo-360.png" alt="Logo GoTransfer" width={120} height={114} priority className="drop-shadow-2xl lg:h-auto lg:w-40" />
        <p className="text-3xl font-bold tracking-tight lg:text-4xl">GoTransfer</p>
        <p className="max-w-xs text-sm text-white/75 lg:text-base">Sua agência vende. Nós conectamos o transporte.</p>
      </div>
      <div className="flex flex-1 items-start justify-center rounded-t-3xl bg-canvas px-5 pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-8 lg:items-center lg:rounded-l-3xl lg:rounded-tr-none">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
