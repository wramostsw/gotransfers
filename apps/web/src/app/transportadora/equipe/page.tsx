import type { Metadata } from "next";
import { TeamPage } from "@/components/team-page";
import { CARRIER_NAV } from "@/lib/nav";

export const metadata: Metadata = { title: "Equipe da transportadora" };

export default function TransportadoraEquipePage() {
  return <TeamPage area="transportadora" areaTitle="Portal da transportadora" nav={CARRIER_NAV} />;
}
