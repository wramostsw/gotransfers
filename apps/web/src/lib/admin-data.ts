import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Nomes de quem aparece no histórico (perfis visíveis à equipe GoTransfer). */
export async function profileNames(supabase: SupabaseClient, ids: Array<string | null>) {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  if (unique.length === 0) return new Map<string, string>();
  const { data } = await supabase.from("profiles").select("id, full_name, email").in("id", unique);
  return new Map((data ?? []).map((p: { id: string; full_name: string; email: string | null }) => [p.id, p.full_name || p.email || "Usuário"]));
}

export async function organizationNames(supabase: SupabaseClient, ids: Array<string | null>) {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  if (unique.length === 0) return new Map<string, string>();
  const { data } = await supabase.from("organizations").select("id, trade_name").in("id", unique);
  return new Map((data ?? []).map((o: { id: string; trade_name: string }) => [o.id, o.trade_name]));
}

/** "há 5 min", "há 2 h", "ontem", ou a data. */
export function timeAgo(iso: string, now: Date) {
  const diff = Math.max(0, now.getTime() - new Date(iso).getTime());
  const min = Math.round(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  if (d === 1) return "ontem";
  if (d < 7) return `há ${d} dias`;
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}
