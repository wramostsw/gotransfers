import { notFound } from "next/navigation";
import { Panel } from "@/components/admin/kit";
import { requireArea } from "@/lib/auth";
import { LOCATION_KIND_LABEL, UUID_RE, moneyInput, type LocationKind } from "@/lib/bookings";
import { createClient } from "@/lib/supabase/server";
import { RuleForm, type RuleValues } from "./rule-form";

type RuleRecord = {
  name: string;
  mode: string;
  agency_id: string | null;
  service_kind: string | null;
  category_id: string | null;
  origin_location_id: string | null;
  destination_location_id: string | null;
  origin_city: string | null;
  destination_city: string | null;
  is_bidirectional: boolean;
  sale_price_cents: number | null;
  base_cents: number;
  per_km_cents: number;
  per_min_cents: number;
  min_price_cents: number;
  take_bps: number;
  valid_from: string;
  valid_until: string | null;
  priority: number;
  is_active: boolean;
};

/** Formulário de regra de preço: criação (ruleId nulo) ou edição. */
export async function RuleEditor({ ruleId }: { ruleId: string | null }) {
  await requireArea("admin");
  if (ruleId && !UUID_RE.test(ruleId)) notFound();
  const supabase = await createClient();
  const [agencies, categories, locations, rule] = await Promise.all([
    supabase.from("organizations").select("id, trade_name").eq("type", "agency").order("trade_name").returns<Array<{ id: string; trade_name: string }>>(),
    supabase.from("vehicle_categories").select("id, name").eq("is_active", true).order("sort_order").returns<Array<{ id: string; name: string }>>(),
    supabase
      .from("locations")
      .select("id, name, kind, city")
      .is("organization_id", null)
      .eq("is_active", true)
      .order("name")
      .returns<Array<{ id: string; name: string; kind: LocationKind; city: string }>>(),
    ruleId ? supabase.from("pricing_rules").select("*").eq("id", ruleId).maybeSingle<RuleRecord>() : Promise.resolve({ data: null }),
  ]);
  if (ruleId && !rule.data) notFound();

  const r = rule.data;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const defaults: RuleValues = r
    ? {
        name: r.name,
        mode: r.mode,
        agency_id: r.agency_id ?? "",
        service_kind: r.service_kind ?? "",
        category_id: r.category_id ?? "",
        origin_location_id: r.origin_location_id ?? "",
        destination_location_id: r.destination_location_id ?? "",
        origin_city: r.origin_city ?? "",
        destination_city: r.destination_city ?? "",
        is_bidirectional: r.is_bidirectional ? "on" : "off",
        sale_price: moneyInput(r.sale_price_cents),
        base: moneyInput(r.base_cents),
        per_km: moneyInput(r.per_km_cents),
        per_min: moneyInput(r.per_min_cents),
        min_price: moneyInput(r.min_price_cents),
        take_percent: String(r.take_bps / 100).replace(".", ","),
        valid_from: r.valid_from,
        valid_until: r.valid_until ?? "",
        priority: String(r.priority),
        is_active: r.is_active ? "on" : "off",
      }
    : { mode: "fixed", take_percent: "24", valid_from: today, priority: "0" };

  return (
    <Panel className="max-w-5xl p-6">
      <RuleForm
        ruleId={ruleId}
        defaults={defaults}
        agencies={(agencies.data ?? []).map((a) => ({ id: a.id, label: a.trade_name }))}
        categories={(categories.data ?? []).map((c) => ({ id: c.id, label: c.name }))}
        locations={(locations.data ?? []).map((l) => ({ id: l.id, label: `${l.name} · ${LOCATION_KIND_LABEL[l.kind]} · ${l.city}` }))}
      />
    </Panel>
  );
}
