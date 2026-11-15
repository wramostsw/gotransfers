import "server-only";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { requireSession } from "@/lib/auth";

/**
 * Acesso ao app do motorista: quem tem papel de motorista e, enquanto o app está em
 * modo demonstração, a equipe GoTransfer (para testar). Os dados exibidos são fictícios.
 */
export async function DriverGate({ children }: { children: ReactNode }) {
  const session = await requireSession();
  const allowed = session.memberships.some((m) => m.role === "driver" || m.organization.type === "platform");
  if (!allowed) redirect("/inicio");
  return <>{children}</>;
}
