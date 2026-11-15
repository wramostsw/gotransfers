import type { Metadata } from "next";
import { ServiceScreen } from "./service-screen";

export const metadata: Metadata = { title: "Serviço" };

export default function ServicoPage() {
  return <ServiceScreen />;
}
