import type { NavItem } from "@/components/app-shell";

export const AGENCY_NAV: NavItem[] = [
  { href: "/agencia", label: "Visão geral" },
  { href: "/agencia/reservas", label: "Reservas" },
  { href: "/agencia/passageiros", label: "Passageiros" },
  { href: "/agencia/locais", label: "Locais" },
  { href: "/agencia/equipe", label: "Equipe" },
];

export const CARRIER_NAV: NavItem[] = [
  { href: "/transportadora", label: "Visão geral" },
  { href: "/transportadora/ofertas", label: "Ofertas" },
  { href: "/transportadora/servicos", label: "Serviços" },
  { href: "/transportadora/veiculos", label: "Veículos" },
  { href: "/transportadora/motoristas", label: "Motoristas" },
  { href: "/transportadora/equipe", label: "Equipe" },
];
