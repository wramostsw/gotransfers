import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { likePattern, oneOf, param, type RawParams } from "@/lib/query";
import type { OrgStatus, OrgType } from "@/lib/roles";

export const ORG_TABS = ["todas", "agencias", "transportadoras", "autonomos"] as const;
export type OrgTab = (typeof ORG_TABS)[number];
export const ORG_STATUSES = ["", "pending", "active", "suspended", "blocked"] as const;

export type OrgFilters = { tab: OrgTab; status: string; q: string };

export function readOrgFilters(params: RawParams): OrgFilters {
  return {
    tab: oneOf(param(params, "tipo"), ORG_TABS, "todas"),
    status: oneOf(param(params, "status"), ORG_STATUSES, ""),
    q: param(params, "q").slice(0, 80),
  };
}

export type OrgRow = {
  id: string;
  type: OrgType;
  trade_name: string;
  legal_name: string;
  tax_id: string | null;
  is_individual: boolean;
  status: OrgStatus;
  created_at: string;
};

/** Consulta de organizações com os filtros da tela (a mesma usada na exportação). */
export function orgQuery(supabase: SupabaseClient, f: OrgFilters, withCount = true) {
  let q = supabase
    .from("organizations")
    .select("id, type, trade_name, legal_name, tax_id, is_individual, status, created_at", withCount ? { count: "exact" } : undefined)
    .neq("type", "platform");
  if (f.tab === "agencias") q = q.eq("type", "agency");
  if (f.tab === "transportadoras") q = q.eq("type", "transport_company").eq("is_individual", false);
  if (f.tab === "autonomos") q = q.eq("type", "transport_company").eq("is_individual", true);
  if (f.status) q = q.eq("status", f.status);
  if (f.q) {
    const like = likePattern(f.q);
    const digits = f.q.replace(/\D/g, "");
    q = q.or(`trade_name.ilike.${like},legal_name.ilike.${like}${digits.length >= 3 ? `,tax_id.ilike.%${digits}%` : ""}`);
  }
  return q.order("created_at", { ascending: false });
}

export function orgTypeLabel(o: Pick<OrgRow, "type" | "is_individual">) {
  if (o.type === "agency") return "Agência";
  if (o.type === "transport_company") return o.is_individual ? "Autônomo" : "Transportadora";
  return "Plataforma";
}

export const ORG_STATUS_TONE: Record<OrgStatus, "green" | "amber" | "red" | "gray"> = {
  active: "green",
  pending: "amber",
  suspended: "red",
  blocked: "gray",
};

export function formatTaxId(taxId: string | null) {
  if (!taxId) return "Sem documento";
  const d = taxId.replace(/\D/g, "");
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  return taxId;
}
