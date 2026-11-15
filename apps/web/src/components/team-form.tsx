"use client";

import { useActionState } from "react";
import { addTeamMember, type TeamArea, type TeamFormState } from "@/lib/team-actions";
import { Alert, Button, Field, SelectField } from "@/components/ui";
import { ROLE_LABEL, type MemberRole } from "@/lib/roles";

const initial: TeamFormState = {};

export function AddTeamMemberForm({ area, roles }: { area: TeamArea; roles: MemberRole[] }) {
  const [state, action, pending] = useActionState(addTeamMember.bind(null, area), initial);
  const v = state.values ?? {};
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      {state.error ? <div className="sm:col-span-3"><Alert>{state.error}</Alert></div> : null}
      {state.success ? <div className="sm:col-span-3"><Alert tone="success">{state.success}</Alert></div> : null}
      <Field label="E-mail da pessoa" name="email" type="email" inputMode="email" required defaultValue={v.email} />
      <SelectField key={v.role ?? "-"} label="Papel" name="role" defaultValue={v.role ?? roles[roles.length - 1]}>
        {roles.map((role) => (
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
