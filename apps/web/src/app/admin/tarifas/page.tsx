import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AdminHeader, AdminSkeleton, DataTable, EmptyRow, Panel, PanelHeader, Pill, TabsNav, Td, Th, btn, formatDay } from "@/components/admin/kit";
import { LocationForm } from "@/components/booking-forms";
import { Icon } from "@/components/icons";
import { requireArea } from "@/lib/auth";
import { createPlatformLocation, setLocationActive } from "@/lib/booking-actions";
import { LOCATION_KIND_LABEL, PRICING_MODE_LABEL, SERVICE_KIND_LABEL, formatMoney, type LocationKind, type PricingMode, type ServiceKind } from "@/lib/bookings";
import { oneOf, param, type RawParams } from "@/lib/query";
import { createClient } from "@/lib/supabase/server";
import { setRuleActive } from "./actions";

export const metadata: Metadata = { title: "Tarifas e rotas · Admin" };

type RuleRow = {
  id: string;
  name: string;
  mode: PricingMode;
  service_kind: ServiceKind | null;
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
  version: number;
  agency: { trade_name: string } | null;
  category: { name: string } | null;
  origin: { name: string } | null;
  destination: { name: string } | null;
};

type LocationRow = {
  id: string;
  organization_id: string | null;
  kind: LocationKind;
  name: string;
  code: string | null;
  address_line: string | null;
  city: string;
  state: string;
  is_active: boolean;
  organization: { trade_name: string } | null;
};

export default function TarifasPage({ searchParams }: PageProps<"/admin/tarifas">) {
  return (
    <Suspense fallback={<AdminSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

function day(date: string) {
  return formatDay(`${date}T12:00:00-03:00`);
}

function route(r: RuleRow) {
  const from = r.origin?.name ?? r.origin_city ?? "Qualquer origem";
  const to = r.destination?.name ?? r.destination_city ?? "Qualquer destino";
  return `${from} ${r.is_bidirectional ? "↔" : "→"} ${to}`;
}

async function Content({ searchParams }: { searchParams: Promise<RawParams> }) {
  await requireArea("admin");
  const tab = oneOf(param(await searchParams, "aba"), ["regras", "locais"] as const, "regras");
  const supabase = await createClient();
  const [rules, locations] = await Promise.all([
    supabase
      .from("pricing_rules")
      .select(
        "id, name, mode, service_kind, origin_city, destination_city, is_bidirectional, sale_price_cents, base_cents, per_km_cents, per_min_cents, min_price_cents, take_bps, valid_from, valid_until, priority, is_active, version, agency:organizations(trade_name), category:vehicle_categories(name), origin:locations!pricing_rules_origin_location_id_fkey(name), destination:locations!pricing_rules_destination_location_id_fkey(name)",
      )
      .order("is_active", { ascending: false })
      .order("priority", { ascending: false })
      .order("created_at", { ascending: false })
      .returns<RuleRow[]>(),
    supabase
      .from("locations")
      .select("id, organization_id, kind, name, code, address_line, city, state, is_active, organization:organizations(trade_name)")
      .order("organization_id", { ascending: true, nullsFirst: true })
      .order("name")
      .returns<LocationRow[]>(),
  ]);
  const ruleRows = rules.data ?? [];
  const locationRows = locations.data ?? [];

  return (
    <>
      <AdminHeader
        title="Tarifas e rotas"
        description="Quanto a agência paga por cada transfer e quanto fica com a plataforma. Sem regra aplicável, o pedido vai para cotação manual."
        actions={
          tab === "regras" ? (
            <Link href="/admin/tarifas/nova" className={btn.primary}>
              <Icon name="plus" size={16} strokeWidth={2.4} />
              Nova regra de preço
            </Link>
          ) : null
        }
      />

      <Panel>
        <TabsNav
          label="Seções"
          items={[
            { label: "Regras de preço", href: "/admin/tarifas", count: ruleRows.length, active: tab === "regras" },
            { label: "Locais", href: "/admin/tarifas?aba=locais", count: locationRows.length, active: tab === "locais" },
          ]}
        />

        {tab === "regras" ? (
          <DataTable minWidth={1040}>
            <thead>
              <tr>
                <Th>Regra</Th>
                <Th>Rota</Th>
                <Th>Filtros</Th>
                <Th align="right">Agência paga</Th>
                <Th align="right">Taxa</Th>
                <Th>Vigência</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rules.error ? (
                <EmptyRow colSpan={8} title="Não foi possível carregar as regras">
                  Confirme que a migração 20261115000005 foi rodada e recarregue.
                </EmptyRow>
              ) : ruleRows.length === 0 ? (
                <EmptyRow colSpan={8} title="Nenhuma regra de preço">
                  Enquanto não houver regras, toda reserva fica aguardando cotação manual. Comece cadastrando os locais e depois crie a primeira regra.
                </EmptyRow>
              ) : (
                ruleRows.map((r) => (
                  <tr key={r.id} className="hover:bg-[#F8FAFD]">
                    <Td>
                      <Link href={`/admin/tarifas/${r.id}`} className="flex flex-col font-bold hover:text-brand-800">
                        {r.name}
                        <span className="text-xs font-normal text-muted">
                          {PRICING_MODE_LABEL[r.mode]} · versão {r.version}
                          {r.priority !== 0 ? ` · prioridade ${r.priority}` : ""}
                        </span>
                      </Link>
                    </Td>
                    <Td className="text-[#33405F]">{route(r)}</Td>
                    <Td>
                      <span className="flex flex-wrap gap-1.5">
                        {r.agency ? <Pill tone="orange">Contrato · {r.agency.trade_name}</Pill> : null}
                        {r.service_kind ? <Pill>{SERVICE_KIND_LABEL[r.service_kind]}</Pill> : null}
                        {r.category ? <Pill>{r.category.name}</Pill> : null}
                        {!r.agency && !r.service_kind && !r.category ? <span className="text-[13px] text-muted">Sem filtros</span> : null}
                      </span>
                    </Td>
                    <Td align="right" className="font-semibold">
                      {r.mode === "fixed" ? (
                        formatMoney(r.sale_price_cents)
                      ) : (
                        <span className="flex flex-col text-[13px] font-normal text-[#33405F]">
                          <span>
                            {formatMoney(r.base_cents)} + {formatMoney(r.per_km_cents)}/km + {formatMoney(r.per_min_cents)}/min
                          </span>
                          <span className="text-xs text-muted">mínimo {formatMoney(r.min_price_cents)}</span>
                        </span>
                      )}
                    </Td>
                    <Td align="right">
                      {(r.take_bps / 100).toLocaleString("pt-BR")}%
                      {r.mode === "fixed" && r.sale_price_cents ? (
                        <span className="block text-xs text-muted">prestador {formatMoney(r.sale_price_cents - Math.round((r.sale_price_cents * r.take_bps) / 10000))}</span>
                      ) : null}
                    </Td>
                    <Td className="whitespace-nowrap text-[#33405F]">
                      {day(r.valid_from)}
                      {r.valid_until ? ` até ${day(r.valid_until)}` : " em diante"}
                    </Td>
                    <Td>{r.is_active ? <Pill tone="green">Ativa</Pill> : <Pill>Inativa</Pill>}</Td>
                    <Td align="right">
                      <form action={setRuleActive.bind(null, r.id, !r.is_active)}>
                        <button className={btn.small}>{r.is_active ? "Desativar" : "Ativar"}</button>
                      </form>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </DataTable>
        ) : (
          <DataTable minWidth={820}>
            <thead>
              <tr>
                <Th>Local</Th>
                <Th>Tipo</Th>
                <Th>Cidade</Th>
                <Th>Pertence a</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {locations.error ? (
                <EmptyRow colSpan={6} title="Não foi possível carregar os locais" />
              ) : locationRows.length === 0 ? (
                <EmptyRow colSpan={6} title="Nenhum local cadastrado">
                  Cadastre abaixo os aeroportos, rodoviárias e hotéis mais usados. Eles ficam disponíveis para todas as agências.
                </EmptyRow>
              ) : (
                locationRows.map((l) => (
                  <tr key={l.id} className="hover:bg-[#F8FAFD]">
                    <Td>
                      <span className="flex flex-col font-bold">
                        {l.name}
                        {l.code ? ` (${l.code})` : ""}
                        {l.address_line ? <span className="text-xs font-normal text-muted">{l.address_line}</span> : null}
                      </span>
                    </Td>
                    <Td className="text-[#33405F]">{LOCATION_KIND_LABEL[l.kind]}</Td>
                    <Td className="text-[#33405F]">
                      {l.city} · {l.state}
                    </Td>
                    <Td>{l.organization_id ? <Pill>{l.organization?.trade_name ?? "Agência"}</Pill> : <Pill tone="blue">Plataforma</Pill>}</Td>
                    <Td>{l.is_active ? <Pill tone="green">Ativo</Pill> : <Pill>Inativo</Pill>}</Td>
                    <Td align="right">
                      {l.organization_id ? null : (
                        <form action={setLocationActive.bind(null, "admin", l.id, !l.is_active)}>
                          <button className={btn.small}>{l.is_active ? "Desativar" : "Ativar"}</button>
                        </form>
                      )}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </DataTable>
        )}
      </Panel>

      {tab === "locais" ? (
        <Panel>
          <PanelHeader title="Novo local da plataforma" description="Fica disponível para todas as agências e pode ser usado nas regras de preço." />
          <div className="p-5">
            <LocationForm action={createPlatformLocation} />
          </div>
        </Panel>
      ) : null}
    </>
  );
}
