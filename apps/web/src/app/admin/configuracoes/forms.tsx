"use client";

import { useActionState } from "react";
import { btn } from "@/components/admin/kit";
import { Alert } from "@/components/ui";
import { SETTINGS, type SettingsValues } from "@/lib/settings";
import { createCategory, saveSettings, type SettingsState } from "./actions";

const initial: SettingsState = {};

export function SettingsForm({ values, canEdit }: { values: SettingsValues; canEdit: boolean }) {
  const [state, action, pending] = useActionState(saveSettings, initial);
  const entries = Object.entries(SETTINGS);
  const operacao = entries.filter(([, d]) => d.group === "operacao");
  const seguranca = entries.filter(([, d]) => d.group === "seguranca");
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}
      {!canEdit ? <Alert tone="warning">Só o superadmin altera estas configurações. Você pode consultá-las.</Alert> : null}

      <fieldset disabled={!canEdit || pending} className="rounded-2xl border border-line bg-surface p-5 disabled:opacity-90">
        <legend className="sr-only">Operação</legend>
        <h2 className="text-base font-bold">Operação</h2>
        <p className="mb-4 mt-1 text-[13px] text-muted">Valores padrão da plataforma. Contratos de agência poderão definir valores próprios.</p>
        <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
          {operacao.map(([key, def]) => (
            <label key={key} className="flex flex-col gap-1.5 text-[13px] font-semibold">
              {def.label}
              {def.kind === "choice" ? (
                <select name={key} defaultValue={String(values[key] ?? def.options[0])} className="h-10.5 rounded-[10px] border border-[#DCE2EE] bg-surface px-3 text-sm font-medium">
                  {def.options.map((o) => (
                    <option key={o} value={o}>
                      {o.replace("America/", "").replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              ) : def.kind === "number" ? (
                <span className="flex h-10.5 items-center overflow-hidden rounded-[10px] border border-[#DCE2EE]">
                  <input
                    name={key}
                    type="number"
                    inputMode="numeric"
                    min={def.min}
                    max={def.max}
                    required
                    defaultValue={String(values[key] ?? "")}
                    className="h-full min-w-0 flex-1 bg-surface px-3 text-sm font-medium outline-none"
                  />
                  <span className="px-3 text-[13px] font-medium text-muted">{def.unit}</span>
                </span>
              ) : null}
              <span className="text-xs font-normal text-muted">{def.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset disabled={!canEdit || pending} className="rounded-2xl border border-line bg-surface p-5">
        <legend className="sr-only">Segurança</legend>
        <h2 className="mb-2 text-base font-bold">Segurança</h2>
        {seguranca.map(([key, def]) => (
          <div key={key} className="flex flex-wrap items-center gap-4 border-t border-[#F1F4F9] py-3 first-of-type:border-0">
            <div className="min-w-60 flex-1">
              <label htmlFor={`set-${key}`} className="text-sm font-semibold">
                {def.label}
              </label>
              <p className="mt-0.5 text-[13px] text-muted">{def.hint}</p>
            </div>
            {def.kind === "boolean" ? (
              <input id={`set-${key}`} name={key} type="checkbox" defaultChecked={values[key] === true} className="size-5 accent-brand-800" />
            ) : def.kind === "number" ? (
              <span className="flex h-10 items-center overflow-hidden rounded-[10px] border border-[#DCE2EE]">
                <input
                  id={`set-${key}`}
                  name={key}
                  type="number"
                  min={def.min}
                  max={def.max}
                  required
                  defaultValue={String(values[key] ?? "")}
                  className="h-full w-20 bg-surface px-3 text-sm font-medium outline-none"
                />
                <span className="px-3 text-[13px] text-muted">{def.unit}</span>
              </span>
            ) : null}
          </div>
        ))}
      </fieldset>

      {canEdit ? (
        <div className="flex justify-end">
          <button type="submit" disabled={pending} className={btn.primary}>
            {pending ? "Salvando…" : "Salvar configurações"}
          </button>
        </div>
      ) : null}
    </form>
  );
}

export function NewCategoryForm() {
  const [state, action, pending] = useActionState(createCategory, initial);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3 border-t border-[#EEF1F7] px-5 py-4">
      {state.error ? <div className="w-full"><Alert>{state.error}</Alert></div> : null}
      {state.success ? <div className="w-full"><Alert tone="success">{state.success}</Alert></div> : null}
      <label className="flex min-w-48 flex-1 flex-col gap-1.5 text-[13px] font-semibold">
        Nova categoria
        <input name="name" required maxLength={40} placeholder="Ex.: Van executiva" className="h-10 rounded-[10px] border border-[#DCE2EE] px-3 text-sm font-normal" />
      </label>
      <label className="flex w-36 flex-col gap-1.5 text-[13px] font-semibold">
        Passageiros
        <input name="typical_seats" type="number" min={1} max={80} required defaultValue="4" className="h-10 rounded-[10px] border border-[#DCE2EE] px-3 text-sm font-normal" />
      </label>
      <button type="submit" disabled={pending} className={btn.secondary}>
        {pending ? "Criando…" : "Criar categoria"}
      </button>
    </form>
  );
}
