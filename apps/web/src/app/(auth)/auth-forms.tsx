"use client";

import { useActionState } from "react";
import { signIn, signUp, type AuthFormState } from "./actions";
import { Alert, Button, Field } from "@/components/ui";

const initial: AuthFormState = {};

export function SignInForm() {
  const [state, action, pending] = useActionState(signIn, initial);
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error ? <Alert>{state.error}</Alert> : null}
      <Field label="E-mail" name="email" type="email" autoComplete="email" inputMode="email" required defaultValue={state.email} />
      <Field label="Senha" name="password" type="password" autoComplete="current-password" required />
      <Button type="submit" variant="accent" disabled={pending}>
        {pending ? "Entrando…" : "Entrar"}
      </Button>
    </form>
  );
}

export function SignUpForm() {
  const [state, action, pending] = useActionState(signUp, initial);
  if (state.success) return <Alert tone="success">{state.success}</Alert>;
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error ? <Alert>{state.error}</Alert> : null}
      <Field label="Nome completo" name="full_name" autoComplete="name" required defaultValue={state.fullName} />
      <Field label="E-mail" name="email" type="email" autoComplete="email" inputMode="email" required defaultValue={state.email} />
      <Field
        label="Senha"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
        hint="Pelo menos 8 caracteres."
      />
      <Button type="submit" variant="accent" disabled={pending}>
        {pending ? "Criando conta…" : "Criar conta"}
      </Button>
    </form>
  );
}
