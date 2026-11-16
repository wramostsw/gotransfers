"use client";

import { useActionState, useState } from "react";
import { Alert, Button, Field, SelectField } from "@/components/ui";
import type { FormState } from "@/lib/booking-actions";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;
const initial: FormState = {};

function Feedback({ state }: { state: FormState }) {
  if (state.error) return <Alert>{state.error}</Alert>;
  if (state.success) return <Alert tone="success">{state.success}</Alert>;
  return null;
}

export type ProviderOption = { org_id: string; name: string; is_individual: boolean; vehicles: number; drivers: number; day_load: number };

/** Abre uma rodada de ofertas (operação GoTransfer). */
export function DispatchForm({ action, providers, defaultWindowMin }: { action: Action; providers: ProviderOption[]; defaultWindowMin: number }) {
  const [state, formAction, pending] = useActionState(action, initial);
  const [mode, setMode] = useState(state.values?.mode ?? "simultaneous");
  const chosen = (state.values?.providers ?? "").split(",");
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Feedback state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Modalidade" name="mode" value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="simultaneous">Simultânea · todos recebem, o primeiro aceite vence</option>
          <option value="sequential">Sequencial · um por vez, na ordem marcada</option>
          <option value="directed">Direcionada · um prestador escolhido</option>
        </SelectField>
        <Field
          label="Prazo para aceitar (minutos)"
          name="window_min"
          type="number"
          min={1}
          max={10080}
          required
          defaultValue={state.values?.window_min ?? String(defaultWindowMin)}
          hint={mode === "sequential" ? "Prazo de cada prestador da fila." : "Depois disso a oferta vence."}
        />
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-ink">
          {mode === "directed" ? "Escolha o prestador" : "Prestadores (deixe todos desmarcados para enviar a todos os elegíveis)"}
        </legend>
        {providers.length === 0 ? (
          <p className="rounded-xl bg-warning-50 px-4 py-3 text-sm text-warning-700">
            Nenhum prestador pode atender: é preciso transportadora ativa com veículo aprovado desta categoria e motorista com CNH válida.
          </p>
        ) : (
          providers.map((p) => (
            <label key={p.org_id} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-sm hover:bg-brand-50">
              <input
                type={mode === "directed" ? "radio" : "checkbox"}
                name="providers"
                value={p.org_id}
                defaultChecked={chosen.includes(p.org_id)}
                className="size-4.5 accent-brand-800"
              />
              <span className="flex-1">
                <span className="font-semibold text-ink">{p.name}</span>
                {p.is_individual ? <span className="ml-2 text-xs font-semibold text-accent-700">Autônomo</span> : null}
                <span className="block text-xs text-muted">
                  {p.vehicles} veículo(s) compatível(is) · {p.drivers} motorista(s) apto(s) · {p.day_load} serviço(s) no dia
                </span>
              </span>
            </label>
          ))
        )}
      </fieldset>
      <div>
        <Button type="submit" disabled={pending || providers.length === 0}>
          {pending ? "Enviando…" : "Enviar oferta"}
        </Button>
      </div>
    </form>
  );
}

export type FleetOption = { id: string; label: string; org_id: string };

/** Designa motorista e veículo. Com `providers`, é a atribuição manual da operação. */
export function AssignForm({
  action,
  drivers,
  vehicles,
  providers,
  currentProvider,
  requireReason,
  submitLabel = "Designar",
}: {
  action: Action;
  drivers: FleetOption[];
  vehicles: FleetOption[];
  providers?: Array<{ id: string; label: string }>;
  currentProvider?: string | null;
  requireReason: boolean;
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  const v = state.values ?? {};
  const [provider, setProvider] = useState(v.provider_id ?? currentProvider ?? providers?.[0]?.id ?? "");
  const ownDrivers = providers ? drivers.filter((d) => d.org_id === provider) : drivers;
  const ownVehicles = providers ? vehicles.filter((d) => d.org_id === provider) : vehicles;
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Feedback state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        {providers ? (
          <SelectField label="Prestador" name="provider_id" value={provider} onChange={(e) => setProvider(e.target.value)} className="sm:col-span-2">
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </SelectField>
        ) : null}
        <SelectField key={`d${provider}${v.driver_id ?? ""}`} label="Motorista" name="driver_id" required defaultValue={v.driver_id ?? ""}>
          <option value="">Escolha…</option>
          {ownDrivers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </SelectField>
        <SelectField key={`v${provider}${v.vehicle_id ?? ""}`} label="Veículo" name="vehicle_id" required defaultValue={v.vehicle_id ?? ""}>
          <option value="">Escolha…</option>
          {ownVehicles.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </SelectField>
        {requireReason ? (
          <Field label="Justificativa" name="reason" required minLength={3} maxLength={250} className="sm:col-span-2" defaultValue={v.reason} />
        ) : null}
      </div>
      <p className="text-[13px] text-muted">O sistema confere aprovação, CNH, categoria, capacidade e conflito de agenda antes de salvar.</p>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

/** Ação com motivo, recolhida até abrir (interromper, liberar, recusar). */
export function ReasonAction({
  action,
  summary,
  button,
  required = true,
  tone = "danger",
}: {
  action: Action;
  summary: string;
  button: string;
  required?: boolean;
  tone?: "danger" | "secondary";
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <details className="rounded-xl border border-line bg-surface" open={Boolean(state.error)}>
      <summary className={`cursor-pointer px-4 py-3 text-sm font-semibold ${tone === "danger" ? "text-danger-700" : "text-ink"}`}>{summary}</summary>
      <form action={formAction} className="flex flex-col gap-3 border-t border-line px-4 py-4">
        <Feedback state={state} />
        <Field label={required ? "Motivo" : "Motivo (opcional)"} name="reason" required={required} minLength={required ? 3 : undefined} maxLength={300} defaultValue={state.values?.reason} />
        <div>
          <Button type="submit" variant={tone === "danger" ? "danger" : "secondary"} size="sm" disabled={pending}>
            {pending ? "Enviando…" : button}
          </Button>
        </div>
      </form>
    </details>
  );
}

/** Botão simples que executa uma ação e mostra o resultado. */
export function SubmitAction({ action, label, pendingLabel = "Enviando…", variant = "primary" }: { action: Action; label: string; pendingLabel?: string; variant?: "primary" | "secondary" }) {
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <Button type="submit" variant={variant} disabled={pending}>
        {pending ? pendingLabel : label}
      </Button>
      <Feedback state={state} />
    </form>
  );
}
