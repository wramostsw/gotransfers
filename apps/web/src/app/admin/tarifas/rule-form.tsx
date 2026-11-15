"use client";

import { useActionState, useState } from "react";
import { Alert, Button, Field, SelectField } from "@/components/ui";
import type { FormState } from "@/lib/booking-actions";
import { SERVICE_KINDS, SERVICE_KIND_LABEL, formatMoney, parseMoney } from "@/lib/bookings";
import { saveRule } from "./actions";

type Option = { id: string; label: string };
export type RuleValues = Record<string, string>;

const initial: FormState = {};

export function RuleForm({
  ruleId,
  defaults,
  agencies,
  categories,
  locations,
}: {
  ruleId: string | null;
  defaults: RuleValues;
  agencies: Option[];
  categories: Option[];
  locations: Option[];
}) {
  const [state, action, pending] = useActionState(saveRule.bind(null, ruleId), initial);
  const v = state.values ?? defaults;
  const checked = (name: string) => (state.values ? state.values[name] === "on" : (defaults[name] ?? "on") === "on");
  const [mode, setMode] = useState(defaults.mode || "fixed");
  const [sale, setSale] = useState(defaults.sale_price ?? "");
  const [take, setTake] = useState(defaults.take_percent ?? "24");
  const saleCents = parseMoney(sale);
  const takeNumber = Number(take.replace(",", "."));
  const showSplit = mode === "fixed" && Number.isFinite(saleCents) && saleCents > 0 && Number.isFinite(takeNumber) && takeNumber >= 0 && takeNumber <= 100;
  const fee = showSplit ? Math.round((saleCents * Math.round(takeNumber * 100)) / 10000) : 0;

  const select = (name: string, label: string, anyLabel: string, options: Option[]) => (
    <SelectField key={`${name}${v[name] ?? ""}`} label={label} name={name} defaultValue={v[name] ?? ""}>
      <option value="">{anyLabel}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </SelectField>
  );

  return (
    <form action={action} className="flex flex-col gap-6">
      {state.error ? <Alert>{state.error}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome da regra" name="name" required minLength={2} maxLength={160} placeholder="Ex.: Confins ↔ hotéis de BH · sedã" defaultValue={v.name} />
        <SelectField label="Modo de preço" name="mode" value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="fixed">Tabela fixa (preço fechado por rota)</option>
          <option value="distance">Distância e tempo</option>
        </SelectField>
      </div>

      <fieldset className="grid gap-4 rounded-2xl border border-line p-4 sm:grid-cols-2 lg:grid-cols-3">
        <legend className="px-2 text-sm font-bold text-brand-800">Quando esta regra se aplica</legend>
        <p className="text-[13px] text-muted sm:col-span-2 lg:col-span-3">
          Deixe em branco o que não importa. Quanto mais filtros, mais específica; a regra mais específica vence.
        </p>
        {select("agency_id", "Agência (preço contratado)", "Todas as agências", agencies)}
        <SelectField key={`k${v.service_kind ?? ""}`} label="Tipo de transfer" name="service_kind" defaultValue={v.service_kind ?? ""}>
          <option value="">Qualquer tipo</option>
          {SERVICE_KINDS.map((k) => (
            <option key={k} value={k}>
              {SERVICE_KIND_LABEL[k]}
            </option>
          ))}
        </SelectField>
        {select("category_id", "Categoria do veículo", "Qualquer categoria", categories)}
        {select("origin_location_id", "Local de origem", "Qualquer local", locations)}
        {select("destination_location_id", "Local de destino", "Qualquer local", locations)}
        <label className="flex items-center gap-3 text-sm font-medium text-ink">
          <input type="checkbox" name="is_bidirectional" defaultChecked={checked("is_bidirectional")} className="size-5 accent-brand-800" />
          Vale nos dois sentidos
        </label>
        <Field label="Cidade de origem" name="origin_city" maxLength={120} hint="Alternativa ao local exato." defaultValue={v.origin_city} />
        <Field label="Cidade de destino" name="destination_city" maxLength={120} defaultValue={v.destination_city} />
      </fieldset>

      <fieldset className="grid gap-4 rounded-2xl border border-line p-4 sm:grid-cols-2 lg:grid-cols-4">
        <legend className="px-2 text-sm font-bold text-brand-800">Valores</legend>
        {mode === "fixed" ? (
          <Field
            label="Agência paga (R$)"
            name="sale_price"
            inputMode="decimal"
            required
            placeholder="200,00"
            value={sale}
            onChange={(e) => setSale(e.target.value)}
            hint="Valor que a agência paga ao GoTransfer."
          />
        ) : (
          <>
            <Field label="Bandeirada (R$)" name="base" inputMode="decimal" placeholder="0,00" defaultValue={v.base} />
            <Field label="Por km (R$)" name="per_km" inputMode="decimal" placeholder="3,50" defaultValue={v.per_km} />
            <Field label="Por minuto (R$)" name="per_min" inputMode="decimal" placeholder="0,50" defaultValue={v.per_min} />
            <Field label="Preço mínimo (R$)" name="min_price" inputMode="decimal" placeholder="90,00" defaultValue={v.min_price} />
          </>
        )}
        <Field
          label="Taxa da plataforma (%)"
          name="take_percent"
          inputMode="decimal"
          required
          value={take}
          onChange={(e) => setTake(e.target.value)}
          hint="Parte do valor que fica com o GoTransfer."
        />
        {showSplit ? (
          <div className="rounded-xl bg-brand-50 px-4 py-3 text-sm sm:col-span-2">
            <p className="font-bold text-brand-800">Divisão deste preço</p>
            <p className="mt-1 text-ink">
              GoTransfer fica com <strong>{formatMoney(fee)}</strong> · prestador recebe <strong>{formatMoney(saleCents - fee)}</strong>
            </p>
          </div>
        ) : null}
      </fieldset>

      <fieldset className="grid gap-4 rounded-2xl border border-line p-4 sm:grid-cols-2 lg:grid-cols-4">
        <legend className="px-2 text-sm font-bold text-brand-800">Vigência</legend>
        <Field label="Vale a partir de" name="valid_from" type="date" required defaultValue={v.valid_from} />
        <Field label="Vale até (opcional)" name="valid_until" type="date" defaultValue={v.valid_until} />
        <Field label="Prioridade" name="priority" type="number" min={-1000} max={1000} hint="Maior número vence em caso de empate." defaultValue={v.priority ?? "0"} />
        <label className="flex items-center gap-3 text-sm font-medium text-ink">
          <input type="checkbox" name="is_active" defaultChecked={checked("is_active")} className="size-5 accent-brand-800" />
          Regra ativa
        </label>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando…" : ruleId ? "Salvar alterações" : "Criar regra"}
        </Button>
        {ruleId ? <p className="text-sm text-muted">Reservas já confirmadas não mudam: elas guardam a versão usada.</p> : null}
      </div>
    </form>
  );
}
