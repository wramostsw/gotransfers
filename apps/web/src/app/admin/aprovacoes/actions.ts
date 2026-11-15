"use server";

import { revalidatePath } from "next/cache";
import { requireArea } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type ReviewState = { error?: string; success?: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function reviewRegistration(
  entity: "vehicle" | "driver",
  id: string,
  _prev: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  await requireArea("admin");
  if ((entity !== "vehicle" && entity !== "driver") || !UUID_RE.test(id)) return { error: "Cadastro inválido." };
  const decision = String(formData.get("decision") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500);
  if (decision !== "approve" && decision !== "reject") return { error: "Escolha aprovar ou reprovar." };
  if (decision === "reject" && reason.length < 3) return { error: "Escreva o motivo da reprovação." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("review_registration", {
    p_entity: entity,
    p_id: id,
    p_approved: decision === "approve",
    p_reason: decision === "reject" ? reason : null,
  });
  if (error) {
    if (error.message.includes("NOT_ALLOWED")) return { error: "Só o superadmin ou o operador GoTransfer podem aprovar." };
    if (error.message.includes("NOT_FOUND")) return { error: "Este cadastro não existe mais." };
    return { error: "Não foi possível concluir. Tente de novo." };
  }
  revalidatePath("/admin/aprovacoes");
  return { success: decision === "approve" ? "Aprovado." : "Reprovado." };
}
