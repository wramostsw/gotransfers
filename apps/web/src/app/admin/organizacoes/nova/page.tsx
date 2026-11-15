import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminHeader, AdminSkeleton, Panel } from "@/components/admin/kit";
import { requireArea } from "@/lib/auth";
import { CreateOrganizationForm } from "../../admin-forms";

export const metadata: Metadata = { title: "Nova organização · Admin" };

export default function NovaOrganizacaoPage() {
  return (
    <>
      <AdminHeader
        title="Nova organização"
        description="Cadastre uma agência, transportadora ou motorista autônomo. Ela começa em análise até você aprovar."
        crumbs={[{ label: "Organizações", href: "/admin/organizacoes" }, { label: "Nova organização" }]}
      />
      <Suspense fallback={<AdminSkeleton />}>
        <Form />
      </Suspense>
    </>
  );
}

async function Form() {
  await requireArea("admin");
  return (
    <Panel className="max-w-3xl p-6">
      <CreateOrganizationForm />
    </Panel>
  );
}
