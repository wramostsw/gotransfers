"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

/** Botão de envio que pede confirmação antes de ações sensíveis (suspender, bloquear, remover). */
export function ConfirmButton({ message, className, children }: { message: string; className?: string; children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {pending ? "Salvando…" : children}
    </button>
  );
}
