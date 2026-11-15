import type { Metadata } from "next";
import { AreaPlaceholder } from "@/components/area-placeholder";
import { AGENCY_NAV } from "@/lib/nav";

export const metadata: Metadata = { title: "Portal da agência" };

export default function AgenciaPage() {
  return (
    <AreaPlaceholder
      area="agencia"
      title="Portal da agência"
      description="Passageiros, cotações, reservas e acompanhamento dos transfers."
      nav={AGENCY_NAV}
      upcoming={[
        { phase: "Disponível", items: "passageiros, locais e reservas com ida e volta, com preço antes de confirmar (menu acima)" },
        { phase: "Fase 3", items: "importação de reservas em lote" },
        { phase: "Fase 4", items: "acompanhamento da distribuição e do motorista designado" },
        { phase: "Fase 7", items: "cobranças, faturas e comprovantes" },
      ]}
    />
  );
}
