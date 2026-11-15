import type { Metadata } from "next";
import Link from "next/link";
import { Card, buttonClass } from "@/components/ui";

export const metadata: Metadata = { title: "Configuração pendente" };

export default function ConfiguracaoPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center gap-4 px-5 py-10">
      <Card>
        <h1 className="text-xl font-bold text-ink">Falta ligar o app ao banco de dados</h1>
        <p className="mt-2 text-sm text-muted">
          Preencha <code className="font-mono text-ink">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> no arquivo{" "}
          <code className="font-mono text-ink">apps/web/.env.local</code> com a chave pública do projeto Supabase e
          reinicie o servidor.
        </p>
        <Link href="/" className={`${buttonClass("secondary")} mt-5`}>
          Voltar
        </Link>
      </Card>
    </main>
  );
}
