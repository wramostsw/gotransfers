import type { Metadata } from "next";
import { ExecutionScreen } from "./execution-screen";

export const metadata: Metadata = { title: "Em execução" };

export default function ExecucaoPage() {
  return <ExecutionScreen />;
}
