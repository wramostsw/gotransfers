"use client";

import { useActionState, useState } from "react";
import { Alert, Button, Field, SelectField } from "@/components/ui";
import type { FormState } from "@/lib/booking-actions";
import { LOCATION_KINDS, LOCATION_KIND_LABEL, SERVICE_KINDS, SERVICE_KIND_LABEL, type LocationKind } from "@/lib/bookings";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;
const initial: FormState = {};

function Feedback({ state }: { state: FormState }) {
  if (state.error) return <Alert>{state.error}</Alert>;
  if (state.success) return <Alert tone="success">{state.success}</Alert>;
  return null;
}

/** Botão que executa uma ação do servidor e mostra o resultado logo abaixo. */
export function ActionButton({
  action,
  label,
  pendingLabel = "Aguarde…",
  variant = "primary",
  confirmMessage,
}: {
  action: Action;
  label: string;
  pendingLabel?: string;
  variant?: "primary" | "secondary";
  confirmMessage?: string;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <Button
        type="submit"
        variant={variant}
        disabled={pending}
        onClick={(e) => {
          if (confirmMessage && !window.confirm(confirmMessage)) e.preventDefault();
        }}
      >
        {pending ? pendingLabel : label}
      </Button>
      <Feedback state={state} />
    </form>
  );
}

/** Cancelamento com motivo obrigatório; fica recolhido até a pessoa abrir. */
export function ReasonForm({ action, summary, button }: { action: Action; summary: string; button: string }) {
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <details className="rounded-xl border border-line bg-surface" open={Boolean(state.error)}>
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-danger-700">{summary}</summary>
      <form action={formAction} className="flex flex-col gap-3 border-t border-line px-4 py-4">
        <Feedback state={state} />
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
          Motivo
          <textarea
            name="reason"
            required
            minLength={3}
            maxLength={500}
            rows={2}
            defaultValue={state.values?.reason}
            className="rounded-xl border border-line bg-surface px-4 py-3 text-base font-normal text-ink"
          />
        </label>
        <div>
          <Button type="submit" variant="danger" size="sm" disabled={pending}>
            {pending ? "Cancelando…" : button}
          </Button>
        </div>
      </form>
    </details>
  );
}

/** Cotação manual de um trecho (só equipe GoTransfer). */
export function ManualQuoteForm({ action, sale, payout }: { action: Action; sale?: string; payout?: string }) {
  const [state, formAction, pending] = useActionState(action, initial);
  const v = state.values ?? {};
  return (
    <form action={formAction} className="grid gap-3 rounded-xl bg-warning-50 p-4 sm:grid-cols-4 sm:items-end">
      <div className="sm:col-span-4">
        <p className="text-sm font-bold text-ink">Cotação manual</p>
        <p className="text-[13px] text-muted">A agência vê só o primeiro valor. A diferença entre os dois é a taxa da plataforma.</p>
      </div>
      {state.error || state.success ? (
        <div className="sm:col-span-4">
          <Feedback state={state} />
        </div>
      ) : null}
      <Field label="Agência paga (R$)" name="sale" inputMode="decimal" required placeholder="200,00" defaultValue={v.sale ?? sale} />
      <Field label="Prestador recebe (R$)" name="payout" inputMode="decimal" required placeholder="152,00" defaultValue={v.payout ?? payout} />
      <Field label="Validade (horas)" name="valid_hours" type="number" min={1} max={720} defaultValue={v.valid_hours ?? "24"} />
      <Button type="submit" disabled={pending}>
        {pending ? "Enviando…" : "Enviar cotação"}
      </Button>
    </form>
  );
}

export function PassengerForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState(action, initial);
  const v = state.values ?? {};
  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2">
      {state.error || state.success ? (
        <div className="sm:col-span-2">
          <Feedback state={state} />
        </div>
      ) : null}
      <Field label="Nome completo" name="full_name" required minLength={3} maxLength={200} defaultValue={v.full_name} />
      <Field label="Telefone (com DDD)" name="phone" type="tel" inputMode="tel" maxLength={32} defaultValue={v.phone} />
      <Field label="E-mail" name="email" type="email" inputMode="email" maxLength={200} defaultValue={v.email} />
      <Field label="Observação" name="notes" maxLength={500} hint="Ex.: idioma, necessidade especial." defaultValue={v.notes} />
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Cadastrando…" : "Cadastrar passageiro"}
        </Button>
      </div>
    </form>
  );
}

export function LocationForm({ action, kinds = LOCATION_KINDS }: { action: Action; kinds?: LocationKind[] }) {
  const [state, formAction, pending] = useActionState(action, initial);
  const v = state.values ?? {};
  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {state.error || state.success ? (
        <div className="sm:col-span-2 lg:col-span-3">
          <Feedback state={state} />
        </div>
      ) : null}
      <SelectField key={v.kind ?? "-"} label="Tipo" name="kind" defaultValue={v.kind ?? kinds[0]}>
        {kinds.map((k) => (
          <option key={k} value={k}>
            {LOCATION_KIND_LABEL[k]}
          </option>
        ))}
      </SelectField>
      <Field label="Nome" name="name" required minLength={2} maxLength={160} placeholder="Ex.: Aeroporto de Confins" defaultValue={v.name} />
      <Field label="Código (opcional)" name="code" maxLength={8} placeholder="Ex.: CNF" defaultValue={v.code} />
      <Field label="Endereço" name="address_line" maxLength={240} className="sm:col-span-2 lg:col-span-1" defaultValue={v.address_line} />
      <Field label="Cidade" name="city" required minLength={2} maxLength={120} defaultValue={v.city} />
      <Field label="UF" name="state" required minLength={2} maxLength={2} placeholder="MG" defaultValue={v.state} />
      <div className="sm:col-span-2 lg:col-span-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Cadastrando…" : "Cadastrar local"}
        </Button>
      </div>
    </form>
  );
}

type Option = { id: string; label: string };

function Leg({ leg, title, locations, v }: { leg: "1" | "2"; title: string; locations: Option[]; v: Record<string, string> }) {
  const sel = (name: string) => v[`${name}_${leg}`] ?? "";
  return (
    <fieldset className="grid gap-4 rounded-2xl border border-line p-4 sm:grid-cols-2">
      <legend className="px-2 text-sm font-bold text-brand-800">{title}</legend>
      <SelectField key={`k${sel("kind")}`} label="Tipo de transfer" name={`kind_${leg}`} required defaultValue={sel("kind")}>
        <option value="">Escolha…</option>
        {SERVICE_KINDS.map((k) => (
          <option key={k} value={k}>
            {SERVICE_KIND_LABEL[k]}
          </option>
        ))}
      </SelectField>
      <Field label="Data e hora do embarque" name={`pickup_${leg}`} type="datetime-local" required hint="Horário de Brasília." defaultValue={sel("pickup")} />
      <SelectField key={`o${sel("origin")}`} label="Origem" name={`origin_${leg}`} required defaultValue={sel("origin")}>
        <option value="">Escolha…</option>
        {locations.map((l) => (
          <option key={l.id} value={l.id}>
            {l.label}
          </option>
        ))}
      </SelectField>
      <SelectField key={`d${sel("destination")}`} label="Destino" name={`destination_${leg}`} required defaultValue={sel("destination")}>
        <option value="">Escolha…</option>
        {locations.map((l) => (
          <option key={l.id} value={l.id}>
            {l.label}
          </option>
        ))}
      </SelectField>
      <Field label="Voo ou linha de ônibus" name={`trip_reference_${leg}`} maxLength={40} placeholder="Ex.: LA3456" defaultValue={sel("trip_reference")} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Distância (km)" name={`distance_km_${leg}`} inputMode="decimal" placeholder="Opcional" defaultValue={sel("distance_km")} />
        <Field label="Duração (min)" name={`duration_min_${leg}`} inputMode="numeric" placeholder="Opcional" defaultValue={sel("duration_min")} />
      </div>
    </fieldset>
  );
}

export function NewBookingForm({
  action,
  passengers,
  locations,
  categories,
}: {
  action: Action;
  passengers: Option[];
  locations: Option[];
  categories: Option[];
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  const v = state.values ?? {};
  const [roundTrip, setRoundTrip] = useState(false);
  return (
    <form action={formAction} className="flex flex-col gap-5">
      <Feedback state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField key={`p${v.passenger_id ?? ""}`} label="Passageiro" name="passenger_id" required defaultValue={v.passenger_id ?? ""}>
          <option value="">Escolha…</option>
          {passengers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </SelectField>
        <Field label="Sua referência interna (opcional)" name="external_ref" maxLength={80} defaultValue={v.external_ref} />
      </div>

      <Leg leg="1" title={roundTrip ? "Ida" : "Trecho"} locations={locations} v={v} />
      <label className="flex items-center gap-3 text-sm font-medium text-ink">
        <input type="checkbox" name="round_trip" checked={roundTrip} onChange={(e) => setRoundTrip(e.target.checked)} className="size-5 accent-brand-800" />
        Incluir a volta (trecho independente, com preço e motorista próprios)
      </label>
      {roundTrip ? <Leg leg="2" title="Volta" locations={locations} v={v} /> : null}

      <fieldset className="grid gap-4 rounded-2xl border border-line p-4 sm:grid-cols-2 lg:grid-cols-4">
        <legend className="px-2 text-sm font-bold text-brand-800">Passageiros e veículo</legend>
        <Field label="Passageiros" name="pax_count" type="number" min={1} max={80} required defaultValue={v.pax_count ?? "1"} />
        <Field label="Malas grandes" name="luggage_large" type="number" min={0} max={200} defaultValue={v.luggage_large ?? "0"} />
        <Field label="Malas médias" name="luggage_medium" type="number" min={0} max={200} defaultValue={v.luggage_medium ?? "0"} />
        <Field label="Cadeirinhas" name="child_seats" type="number" min={0} max={10} defaultValue={v.child_seats ?? "0"} />
        <SelectField key={`c${v.category_id ?? ""}`} label="Categoria do veículo" name="category_id" required defaultValue={v.category_id ?? ""} className="sm:col-span-2">
          <option value="">Escolha…</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </SelectField>
        <label className="flex items-center gap-3 text-sm font-medium text-ink sm:col-span-2">
          <input type="checkbox" name="needs_accessible" defaultChecked={v.needs_accessible === "on"} className="size-5 accent-brand-800" />
          Precisa de veículo acessível
        </label>
        <Field label="Observações para a operação" name="notes" maxLength={500} className="sm:col-span-2 lg:col-span-4" defaultValue={v.notes} />
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Calculando…" : "Ver preço e continuar"}
        </Button>
        <p className="text-sm text-muted">Nada é contratado ainda: você confere o preço e confirma na próxima tela.</p>
      </div>
    </form>
  );
}
