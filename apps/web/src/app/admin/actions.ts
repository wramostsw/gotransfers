"use server";

import { revalidatePath } from "next/cache";
import { requireArea } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { withValues, type FormValues } from "@/lib/form-values";
import { ROLES_BY_ORG_TYPE, isMemberRole, type OrgStatus, type OrgType } from "@/lib/roles";

export type FormState = { error?: string; success?: string; values?: FormValues };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUSES: OrgStatus[] = ["pending", "active", "suspended", "blocked"];

function rpcError(message: string): string {
  if (message.includes("USER_NOT_FOUND")) return "Não existe conta com este e-mail. A pessoa precisa criar a conta primeiro.";
  if (message.includes("ROLE_ORG_MISMATCH")) return "Este papel não combina com o tipo da organização.";
  if (message.includes("CANNOT_REVOKE_SELF")) return "Você não pode remover o seu próprio acesso.";
  if (message.includes("NOT_ALLOWED")) return "Você não tem permissão para esta ação.";
  if (message.includes("organizations_tax_id_unique")) return "Já existe uma organização deste tipo com este documento.";
  return "Não foi possível concluir. Tente de novo.";
}

export async function createOrganization(_prev: FormState, formData: FormData): Promise<FormState> {
  return withValues(await saveOrganization(formData), formData);
}

async function saveOrganization(formData: FormData): Promise<FormState> {
  await requireArea("admin");
  const type = String(formData.get("type") ?? "") as OrgType;
  const tradeName = String(formData.get("trade_name") ?? "").trim();
  const legalName = String(formData.get("legal_name") ?? "").trim() || tradeName;
  const taxId = String(formData.get("tax_id") ?? "").replace(/[^\dA-Za-z]/g, "") || null;
  const isIndividual = type === "transport_company" && formData.get("is_individual") === "on";

  if (type !== "agency" && type !== "transport_company") return { error: "Escolha o tipo da organização." };
  if (tradeName.length < 2) return { error: "Informe o nome fantasia." };
  if (taxId && (taxId.length < 5 || taxId.length > 32)) return { error: "Documento inválido." };

  const supabase = await createClient();
  const { error } = await supabase.from("organizations").insert({
    type,
    trade_name: tradeName,
    legal_name: legalName,
    tax_id: taxId,
    is_individual: isIndividual,
  });
  if (error) return { error: rpcError(error.message) };

  revalidatePath("/admin/organizacoes");
  return { success: `${tradeName} foi cadastrada e está em análise.` };
}

export async function setOrganizationStatus(organizationId: string, status: OrgStatus) {
  await requireArea("admin");
  if (!UUID_RE.test(organizationId) || !STATUSES.includes(status)) return;
  const supabase = await createClient();
  await supabase.from("organizations").update({ status }).eq("id", organizationId);
  revalidatePath("/admin/organizacoes");
  revalidatePath(`/admin/organizacoes/${organizationId}`);
}

export async function addMember(
  organizationId: string,
  orgType: OrgType,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  return withValues(await saveMember(organizationId, orgType, formData), formData);
}

async function saveMember(organizationId: string, orgType: OrgType, formData: FormData): Promise<FormState> {
  await requireArea("admin");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "");
  if (!UUID_RE.test(organizationId)) return { error: "Organização inválida." };
  if (!email.includes("@")) return { error: "Informe o e-mail da pessoa." };
  if (!isMemberRole(role) || !ROLES_BY_ORG_TYPE[orgType]?.includes(role)) return { error: "Escolha um papel válido." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("add_member_by_email", { p_org: organizationId, p_email: email, p_role: role });
  if (error) return { error: rpcError(error.message) };

  revalidatePath(`/admin/organizacoes/${organizationId}`);
  return { success: `Acesso liberado para ${email}.` };
}

export async function revokeMember(organizationId: string, membershipId: string) {
  await requireArea("admin");
  if (!UUID_RE.test(membershipId)) return;
  const supabase = await createClient();
  await supabase.rpc("revoke_membership", { p_membership: membershipId });
  revalidatePath(`/admin/organizacoes/${organizationId}`);
}
