import type { Metadata } from "next";
import { ProfileScreen } from "./profile-screen";

export const metadata: Metadata = { title: "Perfil" };

export default function PerfilPage() {
  return <ProfileScreen />;
}
