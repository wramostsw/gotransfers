import "server-only";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { requireSession } from "@/lib/auth";
import { DEMO_PROFILE, INITIAL_SERVICES } from "@/lib/driver/mock";
import { DriverProvider } from "./driver-store";
import { loadDriverLive } from "./live-data";

/**
 * Acesso ao app do motorista.
 * - Conta ligada a um cadastro de motorista: dados reais do banco.
 * - Equipe GoTransfer sem cadastro de motorista: modo demonstração com dados fictícios.
 */
export async function DriverGate({ children }: { children: ReactNode }) {
  const session = await requireSession();
  const isDriver = session.memberships.some((m) => m.role === "driver");
  const isStaff = session.memberships.some((m) => m.organization.type === "platform");
  if (!isDriver && !isStaff) redirect("/inicio");

  const live = await loadDriverLive(session.userId);
  if (!live && !isStaff) redirect("/inicio");

  return (
    <>
      {live ? null : (
        <p className="bg-brand-950 px-4 pb-1 text-center text-[11px] font-semibold tracking-wide text-on-dark">MODO DEMONSTRAÇÃO · DADOS FICTÍCIOS</p>
      )}
      <DriverProvider live={Boolean(live)} profile={live?.profile ?? DEMO_PROFILE} initialServices={live?.services ?? INITIAL_SERVICES}>
        {children}
      </DriverProvider>
    </>
  );
}
