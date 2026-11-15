import type { Metadata } from "next";
import Link from "next/link";
import { SignUpForm } from "../auth-forms";

export const metadata: Metadata = { title: "Criar conta" };

export default function CadastroPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Criar conta</h1>
        <p className="mt-1 text-sm text-muted">
          Depois do cadastro, a GoTransfer ou o administrador da sua empresa libera o seu acesso.
        </p>
      </div>
      <SignUpForm />
      <p className="text-center text-sm text-muted">
        Já tem conta?{" "}
        <Link href="/entrar" className="font-semibold text-brand-800 underline-offset-2 hover:underline">
          Entrar
        </Link>
      </p>
    </div>
  );
}
