"use client";

import { useActionState, useState } from "react";
import { addMember, createOrganization, updateOrganization, type FormState } from "./actions";
import { Alert, Button, Field, SelectField } from "@/components/ui";
import { ROLES_BY_ORG_TYPE, ROLE_LABEL, type OrgType } from "@/lib/roles";

const initial: FormState = {};

export function CreateOrganizationForm() {
  const [state, action, pending] = useActionState(createOrganization, initial);
  const [type, setType] = useState<OrgType>("agency");
  const v = state.values ?? {};
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      {state.error ? <div className="sm:col-span-2"><Alert>{state.error}</Alert></div> : null}
      {state.success ? <div className="sm:col-span-2"><Alert tone="success">{state.success}</Alert></div> : null}
      <SelectField label="Tipo" name="type" value={type} onChange={(e) => setType(e.target.value as OrgType)}>
        <option value="agency">Agência</option>
        <option value="transport_company">Transportadora</option>
      </SelectField>
      <Field label="Nome fantasia" name="trade_name" required maxLength={200} defaultValue={v.trade_name} />
      <Field label="Razão social" name="legal_name" maxLength={200} hint="Se ficar vazio, usa o nome fantasia." defaultValue={v.legal_name} />
      <Field label="CNPJ ou CPF" name="tax_id" inputMode="numeric" maxLength={32} defaultValue={v.tax_id} />
      {type === "transport_company" ? (
        <label className="flex items-center gap-3 text-sm font-medium text-ink sm:col-span-2">
          <input type="checkbox" name="is_individual" defaultChecked={v.is_individual === "on"} className="size-5 accent-brand-800" />
          Motorista autônomo (transportadora de uma pessoa só)
        </label>
      ) : null}
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Cadastrando…" : "Cadastrar organização"}
        </Button>
      </div>
    </form>
  );
}

export function AddMemberForm({ organizationId, orgType }: { organizationId: string; orgType: OrgType }) {
  const [state, action, pending] = useActionState(addMember.bind(null, organizationId, orgType), initial);
  const v = state.values ?? {};
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      {state.error ? <div className="sm:col-span-3"><Alert>{state.error}</Alert></div> : null}
      {state.success ? <div className="sm:col-span-3"><Alert tone="success">{state.success}</Alert></div> : null}
      <Field label="E-mail da pessoa" name="email" type="email" inputMode="email" required defaultValue={v.email} />
      <SelectField key={v.role ?? "-"} label="Papel" name="role" defaultValue={v.role ?? ROLES_BY_ORG_TYPE[orgType][0]}>
        {ROLES_BY_ORG_TYPE[orgType].map((role) => (
          <option key={role} value={role}>
            {ROLE_LABEL[role]}
          </option>
        ))}
      </SelectField>
      <Button type="submit" disabled={pending}>
        {pending ? "Liberando…" : "Liberar acesso"}
      </Button>
    </form>
  );
}

export function EditOrganizationForm({
  organizationId,
  initialValues,
}: {
  organizationId: string;
  initialValues: { trade_name: string; legal_name: string; tax_id: string };
}) {
  const [state, action, pending] = useActionState(updateOrganization.bind(null, organizationId), initial);
  const v = state.values ?? initialValues;
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      {state.error ? <div className="sm:col-span-2"><Alert>{state.error}</Alert></div> : null}
      {state.success ? <div className="sm:col-span-2"><Alert tone="success">{state.success}</Alert></div> : null}
      <Field label="Nome fantasia" name="trade_name" required maxLength={200} defaultValue={v.trade_name} />
      <Field label="Razão social" name="legal_name" maxLength={200} defaultValue={v.legal_name} />
      <Field label="CNPJ ou CPF" name="tax_id" inputMode="numeric" maxLength={32} defaultValue={v.tax_id} />
      <div className="flex items-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando…" : "Salvar dados"}
        </Button>
      </div>
    </form>
  );
}
