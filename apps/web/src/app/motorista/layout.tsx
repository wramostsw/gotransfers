import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import Image from "next/image";
import { Suspense } from "react";
import { DriverGate } from "./gate";

const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"], weight: ["600", "700", "800"] });

export const metadata: Metadata = { title: { default: "Motorista", template: "%s · Motorista GoTransfer" } };
export const viewport: Viewport = { themeColor: "#001262" };

function Splash() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-brand-900">
      <Image src="/icons/logo-360.png" alt="" width={88} height={84} priority className="animate-pulse" />
      <p className="text-sm text-on-dark">Carregando…</p>
    </div>
  );
}

export default function MotoristaLayout({ children }: LayoutProps<"/motorista">) {
  return (
    <div className={`${jakarta.variable} min-h-dvh bg-brand-950 sm:py-6`}>
      <div className="relative mx-auto flex h-dvh w-full max-w-[430px] flex-col overflow-hidden bg-canvas text-ink sm:h-[min(calc(100dvh-3rem),920px)] sm:rounded-[2rem] sm:shadow-2xl">
        <div aria-hidden className="bg-brand-950 pt-[max(env(safe-area-inset-top),0.25rem)]" />
        <Suspense fallback={<Splash />}>
          <DriverGate>{children}</DriverGate>
        </Suspense>
      </div>
    </div>
  );
}
