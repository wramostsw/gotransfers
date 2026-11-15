import type { Metadata } from "next";
import { IncidentScreen } from "./incident-screen";

export const metadata: Metadata = { title: "Registrar ocorrência" };

export default function OcorrenciaPage() {
  return <IncidentScreen />;
}
