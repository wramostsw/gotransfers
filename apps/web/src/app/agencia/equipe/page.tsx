import type { Metadata } from "next";
import { TeamPage } from "@/components/team-page";
import { AGENCY_NAV } from "@/lib/nav";

export const metadata: Metadata = { title: "Equipe da agência" };

export default function AgenciaEquipePage() {
  return <TeamPage area="agencia" areaTitle="Portal da agência" nav={AGENCY_NAV} />;
}
