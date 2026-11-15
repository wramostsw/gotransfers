import type { Metadata } from "next";
import { AreaPlaceholder } from "@/components/area-placeholder";
import { CARRIER_NAV } from "@/lib/nav";

export const metadata: Metadata = { title: "Portal da transportadora" };

export default function TransportadoraPage() {
  return (
    <AreaPlaceholder
      area="transportadora"
      title="Portal da transportadora"
      description="Frota, motoristas, agenda, ofertas e repasses."
      nav={CARRIER_NAV}
      upcoming={[
        { phase: "Agora", items: "veículos, motoristas e equipe já estão disponíveis no menu acima" },
        { phase: "Fase 2 (próxima parte)", items: "envio de documentos com vencimento" },
        { phase: "Fase 4", items: "ofertas, aceite, designação e agenda" },
        { phase: "Fase 7", items: "extratos e repasses" },
      ]}
    />
  );
}
