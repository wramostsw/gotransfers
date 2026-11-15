"use server";

import { revalidatePath } from "next/cache";
import { INACTIVE_ORG_MESSAGE, orgIsActive, requireOrgRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { withValues, type FormValues } from "@/lib/form-values";
import { ROLES_BY_ORG_TYPE, isMemberRole, type MemberRole } from "@/lib/roles";

export type TeamArea = "agencia" | "transportadora";
export type TeamFormState = { error?: string; success?: string; values?: FormValues };

const ADMIN_ROLE: Record<TeamArea, MemberRole> = { agencia: "agency_admin", transportadora: "carrier_admin" };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function rpcError(message: string): string {
  if (message.includes("USER_NOT_FOUND")) return "Não existe conta com este e-mail. A pessoa precisa criar a conta no app primeiro.";
  if (message.includes("CANNOT_REVOKE_SELF")) return "Você não pode remover o seu próprio acesso.";
  if (message.includes("NOT_ALLOWED")) return "Você não tem permissão para esta ação.";
  return "Não foi possível concluir. Tente de novo.";
}

function teamPath(area: TeamArea) {
  return `/${area}/equipe`;
}

export async function addTeamMember(area: TeamArea, _prev: TeamFormState, formData: FormData): Promise<TeamFormState> {
  return withValues(await saveTeamMember(area, formData), formData);
}

async function saveTeamMember(area: TeamArea, formData: FormData): Promise<TeamFormState> {
  if (area !== "agencia" && area !== "transportadora") return { error: "Área inválida." };
  const { membership } = await requireOrgRole(area, [ADMIN_ROLE[area]]);
  if (!orgIsActive(membership)) return { error: INACTIVE_ORG_MESSAGE };
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Informe um e-mail válido." };
  // O motorista é liberado pela tela de Motoristas, ligado ao cadastro dele.
  const allowed: MemberRole[] = ROLES_BY_ORG_TYPE[membership.organization.type].filter((r) => r !== "driver");
  if (!isMemberRole(role) || !allowed.includes(role)) return { error: "Escolha um papel válido." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("add_member_by_email", {
    p_org: membership.organization.id,
    p_email: email,
    p_role: role,
  });
  if (error) return { error: rpcError(error.message) };
  revalidatePath(teamPath(area));
  return { success: `Acesso liberado para ${email}.` };
}

export async function removeTeamMember(area: TeamArea, membershipId: string) {
  if (area !== "agencia" && area !== "transportadora") return;
  const { membership } = await requireOrgRole(area, [ADMIN_ROLE[area]]);
  if (!orgIsActive(membership)) return;
  if (!UUID_RE.test(membershipId)) return;
  const supabase = await createClient();
  await supabase.rpc("revoke_membership", { p_membership: membershipId });
  revalidatePath(teamPath(area));
}
