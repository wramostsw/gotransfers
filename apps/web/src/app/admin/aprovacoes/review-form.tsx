"use client";

import { useActionState, useState } from "react";
import { reviewRegistration, type ReviewState } from "./actions";
import { Alert, Button } from "@/components/ui";

const initial: ReviewState = {};

export function ReviewForm({ entity, id }: { entity: "vehicle" | "driver"; id: string }) {
  const [state, action, pending] = useActionState(reviewRegistration.bind(null, entity, id), initial);
  const [rejecting, setRejecting] = useState(false);

  if (state.success) return <Alert tone="success">{state.success}</Alert>;

  return (
    <form action={action} className="flex flex-col gap-3">
      {state.error ? <Alert>{state.error}</Alert> : null}
      {rejecting ? (
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
          Motivo da reprovação
          <textarea
            name="reason"
            required
            minLength={3}
            maxLength={500}
            rows={2}
            className="rounded-xl border border-line bg-surface px-4 py-3 text-base font-normal text-ink"
            placeholder="Ex.: CNH vencida, placa não confere, capacidade incorreta"
          />
        </label>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {rejecting ? (
          <>
            <Button size="sm" variant="danger" name="decision" value="reject" disabled={pending}>
              {pending ? "Salvando…" : "Confirmar reprovação"}
            </Button>
            <Button size="sm" variant="ghost" type="button" onClick={() => setRejecting(false)} disabled={pending}>
              Cancelar
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" name="decision" value="approve" disabled={pending}>
              {pending ? "Salvando…" : "Aprovar"}
            </Button>
            <Button size="sm" variant="danger" type="button" onClick={() => setRejecting(true)} disabled={pending}>
              Reprovar
            </Button>
          </>
        )}
      </div>
    </form>
  );
}
