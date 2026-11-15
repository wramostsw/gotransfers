import type { Metadata } from "next";
import { AgendaScreen } from "./agenda-screen";

export const metadata: Metadata = { title: "Agenda" };

export default function AgendaPage() {
  return <AgendaScreen />;
}
