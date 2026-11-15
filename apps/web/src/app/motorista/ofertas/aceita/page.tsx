import type { Metadata } from "next";
import { AcceptedScreen } from "./accepted-screen";

export const metadata: Metadata = { title: "Oferta aceita" };

export default function OfertaAceitaPage() {
  return <AcceptedScreen />;
}
