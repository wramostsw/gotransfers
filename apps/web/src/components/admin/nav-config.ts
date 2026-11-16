import type { IconName } from "@/components/icons";

export type AdminNavItem = {
  href: string;
  label: string;
  icon: IconName;
  /** Módulo do PRD que ainda não existe: aparece apagado, com a fase em que chega. */
  phase?: string;
  /** Chave de contador exibido como selo (ex.: aprovações pendentes). */
  counter?: "approvals";
};

export type AdminNavGroup = { title: string; items: AdminNavItem[] };

/** Mapa do Admin Master segundo o PRD (seção 7.11). */
export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  { title: "Visão geral", items: [{ href: "/admin", label: "Painel", icon: "dashboard" }] },
  {
    title: "Operação",
    items: [
      { href: "/admin/servicos", label: "Central de serviços", icon: "activity" },
      { href: "/admin/reservas", label: "Reservas", icon: "book" },
      { href: "#", label: "Viagens", icon: "route", phase: "Fase 5" },
    ],
  },
  {
    title: "Rede",
    items: [
      { href: "/admin/organizacoes", label: "Organizações", icon: "building" },
      { href: "/admin/aprovacoes", label: "Aprovações", icon: "checkSquare", counter: "approvals" },
      { href: "/admin/motoristas", label: "Motoristas", icon: "user" },
      { href: "/admin/veiculos", label: "Veículos", icon: "car" },
    ],
  },
  {
    title: "Regras do negócio",
    items: [
      { href: "/admin/tarifas", label: "Tarifas e rotas", icon: "tag" },
      { href: "/admin/configuracoes", label: "Distribuição", icon: "shuffle" },
    ],
  },
  {
    title: "Financeiro e suporte",
    items: [
      { href: "#", label: "Financeiro", icon: "money", phase: "Fase 7" },
      { href: "#", label: "Atendimento", icon: "chat", phase: "Fase 5" },
      { href: "#", label: "Relatórios", icon: "chart", phase: "Fase 8" },
    ],
  },
  {
    title: "Administração",
    items: [
      { href: "/admin/usuarios", label: "Usuários e permissões", icon: "users" },
      { href: "/admin/auditoria", label: "Auditoria", icon: "history" },
      { href: "/admin/configuracoes", label: "Configurações", icon: "settings" },
      { href: "#", label: "Integrações", icon: "plug", phase: "Fase 7" },
    ],
  },
];
