"use client";

import { useActionState } from "react";
import { createDriver, createVehicle, linkDriverUser, type FormState } from "./actions";
import { Alert, Button, Field, SelectField } from "@/components/ui";
import { LANGUAGES, LICENSE_CATEGORIES } from "@/lib/fleet";

const initial: FormState = {};

function Feedback({ state, span }: { state: FormState; span: string }) {
  return (
    <>
      {state.error ? <div className={span}><Alert>{state.error}</Alert></div> : null}
      {state.success ? <div className={span}><Alert tone="success">{state.success}</Alert></div> : null}
    </>
  );
}

function Check({ name, label, defaultChecked }: { name: string; label: string; defaultChecked?: boolean }) {
  return (
    <label className="flex min-h-11 items-center gap-3 text-sm font-medium text-ink">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="size-5 accent-brand-800" />
      {label}
    </label>
  );
}

export function CreateVehicleForm({ categories }: { categories: Array<{ id: string; name: string; typical_seats: number }> }) {
  const [state, action, pending] = useActionState(createVehicle, initial);
  const v = state.values ?? {};
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Feedback state={state} span="sm:col-span-2 lg:col-span-4" />
      {/* key: o React só aplica o valor padrão de um <select> ao criá-lo. */}
      <SelectField key={v.category_id ?? "-"} label="Categoria" name="category_id" required defaultValue={v.category_id ?? ""}>
        <option value="" disabled>
          Escolha
        </option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </SelectField>
      <Field label="Marca" name="brand" required maxLength={60} defaultValue={v.brand} />
      <Field label="Modelo" name="model" required maxLength={60} defaultValue={v.model} />
      <Field label="Ano" name="model_year" type="number" inputMode="numeric" min={1980} max={2100} required defaultValue={v.model_year} />
      <Field label="Placa" name="plate" required maxLength={8} autoCapitalize="characters" hint="ABC1D23 ou ABC1234" defaultValue={v.plate} />
      <Field label="Cor" name="color" maxLength={40} defaultValue={v.color} />
      <Field label="Passageiros" name="seats" type="number" inputMode="numeric" min={1} max={80} required hint="Sem contar o motorista." defaultValue={v.seats} />
      <Field label="Malas grandes" name="luggage_large" type="number" inputMode="numeric" min={0} max={200} required defaultValue={v.luggage_large ?? "0"} />
      <Field label="Malas médias" name="luggage_medium" type="number" inputMode="numeric" min={0} max={200} required defaultValue={v.luggage_medium ?? "0"} />
      <Check name="is_accessible" label="Veículo adaptado (acessível)" defaultChecked={v.is_accessible === "on"} />
      <Check name="has_child_seat" label="Tem cadeirinha infantil" defaultChecked={v.has_child_seat === "on"} />
      <div className="sm:col-span-2 lg:col-span-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Cadastrando…" : "Cadastrar veículo"}
        </Button>
      </div>
    </form>
  );
}

export function CreateDriverForm() {
  const [state, action, pending] = useActionState(createDriver, initial);
  const v = state.values ?? {};
  const languages = v.languages?.split(",") ?? ["pt"];
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Feedback state={state} span="sm:col-span-2 lg:col-span-3" />
      <Field label="Nome completo" name="full_name" required maxLength={200} defaultValue={v.full_name} />
      <Field label="Telefone" name="phone" type="tel" inputMode="tel" maxLength={32} defaultValue={v.phone} />
      <Field
        label="E-mail"
        name="email"
        type="email"
        inputMode="email"
        maxLength={200}
        hint="O mesmo que ele usará para entrar no app."
        defaultValue={v.email}
      />
      <Field label="Número da CNH" name="license_number" inputMode="numeric" required maxLength={20} defaultValue={v.license_number} />
      <SelectField key={v.license_category ?? "-"} label="Categoria da CNH" name="license_category" required defaultValue={v.license_category ?? "B"}>
        {LICENSE_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </SelectField>
      <Field label="Validade da CNH" name="license_expires_at" type="date" required defaultValue={v.license_expires_at} />
      <fieldset className="sm:col-span-2 lg:col-span-3">
        <legend className="mb-1 text-sm font-medium text-ink">Idiomas que fala</legend>
        <div className="flex flex-wrap gap-x-6">
          {LANGUAGES.map((l) => (
            <label key={l.code} className="flex min-h-11 items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                name="languages"
                value={l.code}
                defaultChecked={languages.includes(l.code)}
                className="size-5 accent-brand-800"
              />
              {l.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="sm:col-span-2 lg:col-span-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Cadastrando…" : "Cadastrar motorista"}
        </Button>
      </div>
    </form>
  );
}

export function LinkDriverButton({ driverId }: { driverId: string }) {
  const [state, action, pending] = useActionState(linkDriverUser.bind(null, driverId), initial);
  return (
    <form action={action} className="flex flex-col items-start gap-2">
      <Button size="sm" variant="secondary" disabled={pending}>
        {pending ? "Liberando…" : "Liberar acesso ao app"}
      </Button>
      {state.error ? <p role="alert" className="max-w-xs text-xs font-medium text-danger-700">{state.error}</p> : null}
      {state.success ? <p role="status" className="text-xs font-medium text-success-700">{state.success}</p> : null}
    </form>
  );
}
