import type { NavItem } from "@/components/app-shell";

export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Painel" },
  { href: "/admin/organizacoes", label: "Organizações" },
  { href: "/admin/aprovacoes", label: "Aprovações" },
];

export const AGENCY_NAV: NavItem[] = [
  { href: "/agencia", label: "Visão geral" },
  { href: "/agencia/equipe", label: "Equipe" },
];

export const CARRIER_NAV: NavItem[] = [
  { href: "/transportadora", label: "Visão geral" },
  { href: "/transportadora/veiculos", label: "Veículos" },
  { href: "/transportadora/motoristas", label: "Motoristas" },
  { href: "/transportadora/equipe", label: "Equipe" },
];
