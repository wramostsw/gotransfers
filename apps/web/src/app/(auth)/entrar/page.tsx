import type { Metadata } from "next";
import Link from "next/link";
import { SignInForm } from "../auth-forms";

export const metadata: Metadata = { title: "Entrar" };

export default function EntrarPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Entrar</h1>
        <p className="mt-1 text-sm text-muted">Acesse com o e-mail cadastrado.</p>
      </div>
      <SignInForm />
      <p className="text-center text-sm text-muted">
        Ainda não tem conta?{" "}
        <Link href="/cadastro" className="font-semibold text-brand-800 underline-offset-2 hover:underline">
          Criar conta
        </Link>
      </p>
    </div>
  );
}
