import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FilterSelect } from "@/components/admin/filter-select";
import { AdminHeader, AdminSkeleton, Avatar, DataTable, EmptyRow, Pagination, Panel, PanelHeader, Pill, Td, Th, avatarColor, formatDay, initials } from "@/components/admin/kit";
import { Icon } from "@/components/icons";
import { timeAgo } from "@/lib/admin-data";
import { requireArea } from "@/lib/auth";
import { PERMISSIONS, PERMISSION_NOTE } from "@/lib/permissions";
import { hrefWith, oneOf, pageNumber, param, type RawParams } from "@/lib/query";
import { ROLE_LABEL, isMemberRole, type MemberRole, type OrgType } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Usuários e permissões · Admin" };

const PAGE_SIZE = 25;
const ROLE_ORDER = Object.keys(ROLE_LABEL) as MemberRole[];

type UserRow = {
  user_id: string;
  full_name: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed: boolean;
  memberships: Array<{ id: string; role: MemberRole; organization_id: string; organization: string; organization_type: OrgType }>;
};

export default function UsuariosPage({ searchParams }: PageProps<"/admin/usuarios">) {
  return (
    <>
      <AdminHeader
        title="Usuários e permissões"
        description="Quem acessa o GoTransfer, em quais empresas e com qual papel. Para liberar ou remover um acesso, abra a empresa em Organizações."
      />
      <Suspense fallback={<AdminSkeleton />}>
        <Content searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Content({ searchParams }: { searchParams: Promise<RawParams> }) {
  await requireArea("admin");
  const params = await searchParams;
  const q = param(params, "q").toLowerCase().slice(0, 80);
  const roleFilter = param(params, "papel");
  const accessFilter = oneOf(param(params, "acesso"), ["", "com", "sem"] as const, "");
  const page = pageNumber(params);
  const selectedRole: MemberRole = isMemberRole(param(params, "ver")) ? (param(params, "ver") as MemberRole) : "carrier_dispatcher";
  const current: Record<string, string> = {};
  if (q) current.q = q;
  if (roleFilter) current.papel = roleFilter;
  if (accessFilter) current.acesso = accessFilter;
  if (selectedRole !== "carrier_dispatcher") current.ver = selectedRole;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_users");
  const now = new Date();

  const all = (Array.isArray(data) ? data : []) as UserRow[];
  const filtered = all.filter((u) => {
    if (q && !`${u.full_name} ${u.email}`.toLowerCase().includes(q)) return false;
    if (roleFilter && !u.memberships.some((m) => m.role === roleFilter)) return false;
    if (accessFilter === "com" && u.memberships.length === 0) return false;
    if (accessFilter === "sem" && u.memberships.length > 0) return false;
    return true;
  });
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const withoutAccess = all.filter((u) => u.memberships.length === 0).length;

  return (
    <div className="grid items-start gap-4 xl:grid-cols-3">
      <div className="flex flex-col gap-4 xl:col-span-2">
        {error ? (
          <Panel className="border-warning-700/30 bg-warning-50 px-5 py-4">
            <p className="font-semibold text-warning-700">A lista de usuários ainda não está disponível</p>
            <p className="mt-1 text-sm text-ink">
              Rode no Supabase a migração <code className="font-mono">20261115000004_configuracoes_e_usuarios.sql</code> e recarregue a página.
            </p>
          </Panel>
        ) : null}
        {withoutAccess > 0 ? (
          <Panel className="flex flex-wrap items-center gap-3 px-5 py-3.5">
            <Pill tone="amber">{withoutAccess} sem acesso</Pill>
            <p className="flex-1 text-sm text-muted">
              {withoutAccess === 1 ? "Uma pessoa criou conta" : `${withoutAccess} pessoas criaram conta`} e ainda não foi liberada em nenhuma empresa.
            </p>
            <Link href={hrefWith("/admin/usuarios", {}, { acesso: "sem" })} className="text-[13px] font-semibold text-brand-600 hover:underline">
              Ver quem
            </Link>
          </Panel>
        ) : null}
        <Panel>
          <div className="flex flex-wrap items-center gap-2.5 border-b border-[#EEF1F7] px-4 py-3.5">
            <form action="/admin/usuarios" className="flex h-[38px] min-w-56 flex-1 items-center gap-2 rounded-[10px] border border-[#DCE2EE] px-3 text-muted">
              {roleFilter ? <input type="hidden" name="papel" value={roleFilter} /> : null}
              {accessFilter ? <input type="hidden" name="acesso" value={accessFilter} /> : null}
              <Icon name="search" size={16} />
              <label htmlFor="usr-q" className="sr-only">
                Buscar usuário
              </label>
              <input id="usr-q" name="q" type="search" defaultValue={q} placeholder="Nome ou e-mail" className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none" />
            </form>
            <FilterSelect name="papel" label="Papel" options={[{ value: "", label: "Todos" }, ...ROLE_ORDER.map((r) => ({ value: r, label: ROLE_LABEL[r] }))]} />
            <FilterSelect
              name="acesso"
              label="Acesso"
              options={[
                { value: "", label: "Todos" },
                { value: "com", label: "Com empresa" },
                { value: "sem", label: "Sem empresa" },
              ]}
            />
          </div>
          <DataTable minWidth={760}>
            <thead>
              <tr>
                <Th>Usuário</Th>
                <Th>Empresas e papéis</Th>
                <Th>E-mail</Th>
                <Th>Último acesso</Th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <EmptyRow colSpan={4} title="Nenhum usuário encontrado" />
              ) : (
                rows.map((u) => {
                  const name = u.full_name || u.email;
                  return (
                    <tr key={u.user_id} className="hover:bg-[#F8FAFD]">
                      <Td>
                        <span className="flex items-center gap-2.5">
                          <Avatar text={initials(name)} color={avatarColor(u.user_id)} rounded="rounded-full" />
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate font-bold">{name}</span>
                            <span className="truncate text-xs text-muted">{u.email}</span>
                          </span>
                        </span>
                      </Td>
                      <Td>
                        {u.memberships.length === 0 ? (
                          <span className="text-[13px] text-muted">Sem acesso liberado</span>
                        ) : (
                          <span className="flex flex-wrap gap-1.5">
                            {u.memberships.map((m) => (
                              <Link
                                key={m.id}
                                href={`/admin/organizacoes/${m.organization_id}?aba=equipe`}
                                className="rounded-lg bg-[#F1F4F9] px-2 py-1 text-xs font-semibold text-[#33405F] hover:bg-[#E8EEFF]"
                              >
                                {m.organization} · {ROLE_LABEL[m.role]}
                              </Link>
                            ))}
                          </span>
                        )}
                      </Td>
                      <Td>{u.email_confirmed ? <Pill tone="green">Confirmado</Pill> : <Pill tone="amber">Não confirmado</Pill>}</Td>
                      <Td className="whitespace-nowrap text-[#33405F]">
                        {u.last_sign_in_at ? timeAgo(u.last_sign_in_at, now) : "Nunca entrou"}
                        <span className="block text-xs text-muted">conta desde {formatDay(u.created_at)}</span>
                      </Td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </DataTable>
          <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} makeHref={(p) => hrefWith("/admin/usuarios", current, { pagina: p === 1 ? null : p })} />
        </Panel>
      </div>

      <Panel>
        <PanelHeader title="Permissões por papel" description="O que cada papel pode fazer hoje." />
        <div className="flex flex-wrap gap-1.5 border-b border-[#EEF1F7] px-5 py-3">
          {ROLE_ORDER.map((r) => (
            <Link
              key={r}
              href={hrefWith("/admin/usuarios", current, { ver: r === "carrier_dispatcher" ? null : r })}
              aria-current={r === selectedRole ? "true" : undefined}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${r === selectedRole ? "bg-brand-800 text-white" : "bg-[#F1F4F9] text-[#33405F] hover:bg-[#E8EEFF]"}`}
            >
              {ROLE_LABEL[r]}
            </Link>
          ))}
        </div>
        <ul>
          {PERMISSIONS.map((p) => {
            const ok = p.roles.includes(selectedRole);
            return (
              <li key={p.label} className="flex items-center gap-3 border-b border-[#F1F4F9] px-5 py-2.5 last:border-0">
                <span className={`flex-1 text-sm ${ok ? "" : "text-muted"}`}>{p.label}</span>
                {ok ? <Pill tone="green">Permitido</Pill> : <Pill>Sem acesso</Pill>}
              </li>
            );
          })}
        </ul>
        <p className="border-t border-[#EEF1F7] px-5 py-3.5 text-xs leading-relaxed text-muted">
          As permissões são aplicadas no banco de dados, não só na tela. {PERMISSION_NOTE}
        </p>
      </Panel>
    </div>
  );
}
