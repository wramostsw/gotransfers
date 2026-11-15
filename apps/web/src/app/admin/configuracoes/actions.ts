"use server";

import { revalidatePath } from "next/cache";
import { requireArea } from "@/lib/auth";
import { parseSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";

export type SettingsState = { error?: string; success?: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function saveSettings(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const { session } = await requireArea("admin");
  if (!session.memberships.some((m) => m.role === "superadmin")) return { error: "Só o superadmin altera as configurações." };
  const parsed = parseSettings(formData);
  if ("error" in parsed) return { error: parsed.error };

  const supabase = await createClient();
  const { data: currentRows } = await supabase.from("platform_settings").select("key, value");
  const current = new Map((currentRows ?? []).map((r: { key: string; value: unknown }) => [r.key, JSON.stringify(r.value)]));
  const changed = Object.entries(parsed.values).filter(([k, v]) => current.get(k) !== JSON.stringify(v));
  for (const [key, value] of changed) {
    const { error } = await supabase.from("platform_settings").update({ value }).eq("key", key);
    if (error) return { error: "Não foi possível salvar. Confira se a migração de configurações foi aplicada." };
  }
  revalidatePath("/admin/configuracoes");
  return { success: changed.length ? `${changed.length} ${changed.length === 1 ? "configuração salva" : "configurações salvas"}.` : "Nada mudou." };
}

export async function setCategoryActive(categoryId: string, active: boolean) {
  await requireArea("admin");
  if (!UUID_RE.test(categoryId)) return;
  const supabase = await createClient();
  await supabase.from("vehicle_categories").update({ is_active: active }).eq("id", categoryId);
  revalidatePath("/admin/configuracoes");
}

export async function createCategory(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  await requireArea("admin");
  const name = String(formData.get("name") ?? "").trim();
  const seats = Number(formData.get("typical_seats"));
  if (name.length < 2 || name.length > 40) return { error: "Informe o nome da categoria (2 a 40 letras)." };
  if (!Number.isInteger(seats) || seats < 1 || seats > 80) return { error: "Passageiros: use um número entre 1 e 80." };
  const slug = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const supabase = await createClient();
  const { error } = await supabase.from("vehicle_categories").insert({ slug, name, typical_seats: seats, sort_order: 100, is_active: true });
  if (error) {
    if (error.message.includes("duplicate")) return { error: "Já existe uma categoria com esse nome." };
    return { error: "Não foi possível criar. Só a equipe GoTransfer cria categorias." };
  }
  revalidatePath("/admin/configuracoes");
  return { success: `Categoria ${name} criada.` };
}
