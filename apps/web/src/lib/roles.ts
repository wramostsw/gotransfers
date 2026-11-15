export type OrgType = "platform" | "agency" | "transport_company";
export type OrgStatus = "pending" | "active" | "suspended" | "blocked";
export type MemberRole =
  | "superadmin"
  | "platform_operator"
  | "platform_finance"
  | "platform_commercial"
  | "agency_admin"
  | "agency_agent"
  | "agency_finance"
  | "carrier_admin"
  | "carrier_dispatcher"
  | "driver";

export type Area = "admin" | "agencia" | "transportadora" | "motorista";

export const ROLE_LABEL: Record<MemberRole, string> = {
  superadmin: "Superadmin",
  platform_operator: "Operador GoTransfer",
  platform_finance: "Financeiro GoTransfer",
  platform_commercial: "Comercial GoTransfer",
  agency_admin: "Administrador da agência",
  agency_agent: "Agente da agência",
  agency_finance: "Financeiro da agência",
  carrier_admin: "Administrador da transportadora",
  carrier_dispatcher: "Despachante",
  driver: "Motorista",
};

export const ORG_TYPE_LABEL: Record<OrgType, string> = {
  platform: "Plataforma",
  agency: "Agência",
  transport_company: "Transportadora",
};

export const ORG_STATUS_LABEL: Record<OrgStatus, string> = {
  pending: "Em análise",
  active: "Ativa",
  suspended: "Suspensa",
  blocked: "Bloqueada",
};

export const ROLES_BY_ORG_TYPE: Record<OrgType, MemberRole[]> = {
  platform: ["superadmin", "platform_operator", "platform_finance", "platform_commercial"],
  agency: ["agency_admin", "agency_agent", "agency_finance"],
  transport_company: ["carrier_admin", "carrier_dispatcher", "driver"],
};

export const AREA_BY_ROLE: Record<MemberRole, Area> = {
  superadmin: "admin",
  platform_operator: "admin",
  platform_finance: "admin",
  platform_commercial: "admin",
  agency_admin: "agencia",
  agency_agent: "agencia",
  agency_finance: "agencia",
  carrier_admin: "transportadora",
  carrier_dispatcher: "transportadora",
  driver: "motorista",
};

export const AREA_INFO: Record<Area, { title: string; description: string; href: string }> = {
  admin: { title: "Admin Master", description: "Gestão do marketplace, organizações e permissões.", href: "/admin" },
  agencia: { title: "Portal da agência", description: "Passageiros, cotações, reservas e acompanhamento.", href: "/agencia" },
  transportadora: { title: "Portal da transportadora", description: "Frota, motoristas, agenda e ofertas.", href: "/transportadora" },
  motorista: { title: "App do motorista", description: "Ofertas, agenda e execução dos serviços.", href: "/motorista" },
};

export function isMemberRole(value: string): value is MemberRole {
  return value in ROLE_LABEL;
}
