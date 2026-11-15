"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireArea } from "@/lib/auth";
import type { FormState } from "@/lib/booking-actions";
import { SERVICE_KINDS, UUID_RE, bookingError, parseMoney, type ServiceKind } from "@/lib/bookings";
import { withValues } from "@/lib/form-values";
import { createClient } from "@/lib/supabase/server";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function text(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function optionalId(formData: FormData, name: string): string | null | undefined {
  const value = text(formData, name);
  if (!value) return null;
  return UUID_RE.test(value) ? value : undefined;
}

function money(formData: FormData, name: string, required: boolean): number | undefined {
  const raw = text(formData, name);
  if (!raw) return required ? undefined : 0;
  const cents = parseMoney(raw);
  return Number.isFinite(cents) && cents <= 100_000_000 ? cents : undefined;
}

/** Cria (ruleId nulo) ou altera uma regra de preço. Toda alteração gera nova versão no banco. */
export async function saveRule(ruleId: string | null, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireArea("admin");
  const fail = (error: string) => withValues({ error }, formData);
  if (ruleId && !UUID_RE.test(ruleId)) return { error: "Regra inválida." };

  const name = text(formData, "name");
  const mode = text(formData, "mode");
  const kind = text(formData, "service_kind");
  const agencyId = optionalId(formData, "agency_id");
  const categoryId = optionalId(formData, "category_id");
  const originId = optionalId(formData, "origin_location_id");
  const destinationId = optionalId(formData, "destination_location_id");
  const originCity = text(formData, "origin_city") || null;
  const destinationCity = text(formData, "destination_city") || null;
  const takePercent = Number(text(formData, "take_percent").replace(",", "."));
  const validFrom = text(formData, "valid_from");
  const validUntil = text(formData, "valid_until") || null;
  const priority = Number(text(formData, "priority") || "0");

  if (name.length < 2 || name.length > 160) return fail("Dê um nome à regra.");
  if (mode !== "fixed" && mode !== "distance") return fail("Escolha o modo de preço.");
  if (kind && !SERVICE_KINDS.includes(kind as ServiceKind)) return fail("Tipo de transfer inválido.");
  if ([agencyId, categoryId, originId, destinationId].includes(undefined)) return fail("Algum filtro escolhido é inválido.");
  if (originId && destinationId && originId === destinationId) return fail("Origem e destino precisam ser diferentes.");
  for (const city of [originCity, destinationCity]) if (city && (city.length < 2 || city.length > 120)) return fail("Nome de cidade inválido.");
  if (!Number.isFinite(takePercent) || takePercent < 0 || takePercent > 100) return fail("Taxa da plataforma entre 0 e 100%.");
  if (!DATE_RE.test(validFrom)) return fail("Informe o início da vigência.");
  if (validUntil && (!DATE_RE.test(validUntil) || validUntil < validFrom)) return fail("O fim da vigência precisa ser depois do início.");
  if (!Number.isInteger(priority) || priority < -1000 || priority > 1000) return fail("Prioridade entre -1000 e 1000.");

  const sale = money(formData, "sale_price", mode === "fixed");
  const base = money(formData, "base", false);
  const perKm = money(formData, "per_km", false);
  const perMin = money(formData, "per_min", false);
  const minPrice = money(formData, "min_price", false);
  if (mode === "fixed" && (!sale || sale <= 0)) return fail("Informe o preço que a agência paga.");
  if ([base, perKm, perMin, minPrice].includes(undefined)) return fail("Algum valor em reais é inválido.");
  if (mode === "distance" && (base ?? 0) + (perKm ?? 0) + (perMin ?? 0) <= 0) return fail("Informe a bandeirada, o valor por km ou o valor por minuto.");

  const row = {
    name,
    mode,
    agency_id: agencyId,
    service_kind: kind || null,
    category_id: categoryId,
    origin_location_id: originId,
    destination_location_id: destinationId,
    origin_city: originCity,
    destination_city: destinationCity,
    is_bidirectional: formData.get("is_bidirectional") === "on",
    sale_price_cents: mode === "fixed" ? sale : null,
    base_cents: mode === "distance" ? base : 0,
    per_km_cents: mode === "distance" ? perKm : 0,
    per_min_cents: mode === "distance" ? perMin : 0,
    min_price_cents: mode === "distance" ? minPrice : 0,
    take_bps: Math.round(takePercent * 100),
    valid_from: validFrom,
    valid_until: validUntil,
    priority,
    is_active: formData.get("is_active") === "on",
  };

  const supabase = await createClient();
  const { error } = ruleId
    ? await supabase.from("pricing_rules").update(row).eq("id", ruleId).select("id").single()
    : await supabase.from("pricing_rules").insert(row).select("id").single();
  if (error) return fail(error.code === "PGRST116" ? "Você não tem permissão para alterar regras de preço." : bookingError(error.message));
  revalidatePath("/admin/tarifas");
  redirect("/admin/tarifas");
}

export async function setRuleActive(ruleId: string, active: boolean) {
  await requireArea("admin");
  if (!UUID_RE.test(ruleId)) return;
  const supabase = await createClient();
  await supabase.from("pricing_rules").update({ is_active: active }).eq("id", ruleId);
  revalidatePath("/admin/tarifas");
}
