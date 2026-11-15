import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminHeader, AdminSkeleton } from "@/components/admin/kit";
import { RuleEditor } from "../rule-page";

export const metadata: Metadata = { title: "Regra de preço · Admin" };

export default function RegraPage({ params }: PageProps<"/admin/tarifas/[id]">) {
  return (
    <>
      <AdminHeader
        title="Editar regra de preço"
        description="Cada alteração gera uma nova versão. Reservas confirmadas continuam com a versão antiga."
        crumbs={[{ label: "Tarifas e rotas", href: "/admin/tarifas" }, { label: "Editar regra" }]}
      />
      <Suspense fallback={<AdminSkeleton />}>
        <Editor params={params} />
      </Suspense>
    </>
  );
}

async function Editor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RuleEditor ruleId={id} />;
}
