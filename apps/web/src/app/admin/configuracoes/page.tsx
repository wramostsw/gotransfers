import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminHeader, AdminSkeleton, Panel, PanelHeader, Pill } from "@/components/admin/kit";
import { requireArea } from "@/lib/auth";
import type { SettingsValues } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import { setCategoryActive } from "./actions";
import { NewCategoryForm, SettingsForm } from "./forms";

export const metadata: Metadata = { title: "Configurações · Admin" };

type Category = { id: string; name: string; typical_seats: number; is_active: boolean; sort_order: number };

export default function ConfiguracoesPage() {
  return (
    <>
      <AdminHeader title="Configurações" description="Regras que valem para todo o marketplace. Cada mudança fica registrada na auditoria." />
      <Suspense fallback={<AdminSkeleton />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  const { session } = await requireArea("admin");
  const canEdit = session.memberships.some((m) => m.role === "superadmin");
  const canEditCategories = session.memberships.some((m) => m.role === "superadmin" || m.role === "platform_operator");
  const supabase = await createClient();
  const [settingsRes, categoriesRes, vehiclesRes] = await Promise.all([
    supabase.from("platform_settings").select("key, value"),
    supabase.from("vehicle_categories").select("id, name, typical_seats, is_active, sort_order").order("sort_order").returns<Category[]>(),
    supabase.from("vehicles").select("category_id"),
  ]);
  const values: SettingsValues = Object.fromEntries((settingsRes.data ?? []).map((r: { key: string; value: number | boolean | string }) => [r.key, r.value]));
  const usage = ((vehiclesRes.data ?? []) as Array<{ category_id: string }>).reduce<Record<string, number>>(
    (acc, v) => ((acc[v.category_id] = (acc[v.category_id] ?? 0) + 1), acc),
    {},
  );
  const categories = categoriesRes.data ?? [];

  return (
    <div className="grid items-start gap-4 xl:grid-cols-5">
      <div className="xl:col-span-3">
        {settingsRes.error ? (
          <Panel className="border-warning-700/30 bg-warning-50 px-5 py-4">
            <p className="font-semibold text-warning-700">As configurações ainda não estão disponíveis</p>
            <p className="mt-1 text-sm">
              Rode no Supabase a migração <code className="font-mono">20261115000004_configuracoes_e_usuarios.sql</code> e recarregue a página.
            </p>
          </Panel>
        ) : (
          <SettingsForm values={values} canEdit={canEdit} />
        )}
      </div>

      <Panel className="xl:col-span-2">
        <PanelHeader title="Categorias de veículo" description="Desativar esconde a categoria de novos cadastros. Os veículos existentes não mudam." />
        <ul>
          {categories.map((c) => (
            <li key={c.id} className="flex items-center gap-3 border-b border-[#F1F4F9] px-5 py-2.5">
              <span className="flex-1">
                <span className={`text-sm font-semibold ${c.is_active ? "" : "text-muted"}`}>{c.name}</span>
                <span className="block text-xs text-muted">
                  {c.typical_seats} passageiros · {usage[c.id] ?? 0} {usage[c.id] === 1 ? "veículo" : "veículos"}
                </span>
              </span>
              {canEditCategories ? (
                <form action={setCategoryActive.bind(null, c.id, !c.is_active)}>
                  <button
                    role="switch"
                    aria-checked={c.is_active}
                    aria-label={`Categoria ${c.name} ${c.is_active ? "ativa" : "desativada"}`}
                    className={`flex h-6 w-10 items-center rounded-full p-[3px] ${c.is_active ? "justify-end bg-success-700" : "justify-start bg-[#C5CEDF]"}`}
                  >
                    <span className="size-[18px] rounded-full bg-white" />
                  </button>
                </form>
              ) : (
                <Pill tone={c.is_active ? "green" : "gray"}>{c.is_active ? "Ativa" : "Desativada"}</Pill>
              )}
            </li>
          ))}
        </ul>
        {canEditCategories ? <NewCategoryForm /> : null}
      </Panel>
    </div>
  );
}
