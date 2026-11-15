import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminHeader, AdminSkeleton } from "@/components/admin/kit";
import { RuleEditor } from "../rule-page";

export const metadata: Metadata = { title: "Nova regra de preço · Admin" };

export default function NovaRegraPage() {
  return (
    <>
      <AdminHeader
        title="Nova regra de preço"
        description="Define quanto a agência paga e quanto fica com a plataforma em uma rota ou situação."
        crumbs={[{ label: "Tarifas e rotas", href: "/admin/tarifas" }, { label: "Nova regra" }]}
      />
      <Suspense fallback={<AdminSkeleton />}>
        <RuleEditor ruleId={null} />
      </Suspense>
    </>
  );
}
