import type { Metadata } from "next";
import { OffersScreen } from "./offers-screen";

export const metadata: Metadata = { title: "Oportunidades" };

export default function OfertasPage() {
  return <OffersScreen />;
}
