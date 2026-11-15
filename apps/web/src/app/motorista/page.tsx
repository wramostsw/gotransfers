import type { Metadata } from "next";
import { HomeScreen } from "./home-screen";

export const metadata: Metadata = { title: "Início" };

export default function MotoristaPage() {
  return <HomeScreen />;
}
