import type { MemberRole } from "@/lib/roles";

/**
 * O que cada papel pode fazer HOJE. Espelha as regras do banco (RLS e funções):
 * se mudar uma política no Supabase, atualize esta lista.
 */
export const PERMISSIONS: Array<{ label: string; roles: MemberRole[] }> = [
  { label: "Ver todas as organizações da rede", roles: ["superadmin", "platform_operator", "platform_finance", "platform_commercial"] },
  { label: "Cadastrar, aprovar e suspender organizações", roles: ["superadmin", "platform_operator", "platform_commercial"] },
  { label: "Aprovar ou reprovar motoristas e veículos", roles: ["superadmin", "platform_operator"] },
  { label: "Liberar acessos em qualquer empresa", roles: ["superadmin", "platform_operator"] },
  { label: "Gerenciar a equipe GoTransfer", roles: ["superadmin"] },
  { label: "Alterar configurações da plataforma", roles: ["superadmin"] },
  { label: "Editar categorias de veículo", roles: ["superadmin", "platform_operator"] },
  { label: "Ver a auditoria completa", roles: ["superadmin", "platform_operator", "platform_finance", "platform_commercial"] },
  { label: "Gerenciar a equipe da própria empresa", roles: ["agency_admin", "carrier_admin"] },
  { label: "Ver a auditoria da própria empresa", roles: ["agency_admin", "carrier_admin"] },
  { label: "Cadastrar e editar veículos e motoristas", roles: ["carrier_admin", "carrier_dispatcher"] },
  { label: "Liberar o app ao motorista", roles: ["carrier_admin"] },
  { label: "Usar o app do motorista", roles: ["driver"] },
];

export const PERMISSION_NOTE =
  "Empresas em análise, suspensas ou bloqueadas perdem as permissões de cadastro e alteração, mesmo com o papel certo.";
