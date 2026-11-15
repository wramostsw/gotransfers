import type { Metadata } from "next";
import { EarningsScreen } from "./earnings-screen";

export const metadata: Metadata = { title: "Ganhos" };

export default function GanhosPage() {
  return <EarningsScreen />;
}
