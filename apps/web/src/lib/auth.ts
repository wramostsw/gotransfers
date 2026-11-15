import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { AREA_BY_ROLE, type Area, type MemberRole, type OrgStatus, type OrgType } from "@/lib/roles";

export type Membership = {
  id: string;
  role: MemberRole;
  organization: { id: string; type: OrgType; tradeName: string; status: OrgStatus };
};

export type SessionContext = {
  userId: string;
  email: string;
  fullName: string;
  memberships: Membership[];
};

type MembershipRow = {
  id: string;
  role: MemberRole;
  organization: { id: string; type: OrgType; trade_name: string; status: OrgStatus } | null;
};

/**
 * Camada de acesso à sessão: lê o usuário e seus vínculos ativos uma vez por requisição.
 * As permissões aqui servem para decidir o que mostrar; quem protege os dados é o RLS.
 */
export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  if (!isSupabaseConfigured) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: rows }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    supabase
      .from("memberships")
      .select("id, role, organization:organizations(id, type, trade_name, status)")
      .eq("user_id", user.id)
      .eq("status", "active")
      .returns<MembershipRow[]>(),
  ]);

  const memberships: Membership[] = (rows ?? [])
    .filter((r) => r.organization)
    .map((r) => ({
      id: r.id,
      role: r.role,
      organization: {
        id: r.organization!.id,
        type: r.organization!.type,
        tradeName: r.organization!.trade_name,
        status: r.organization!.status,
      },
    }));

  return {
    userId: user.id,
    email: user.email ?? "",
    fullName: profile?.full_name || user.email || "",
    memberships,
  };
});

export async function requireSession(): Promise<SessionContext> {
  if (!isSupabaseConfigured) redirect("/configuracao");
  const session = await getSessionContext();
  if (!session) redirect("/entrar");
  return session;
}

/** Exige um vínculo ativo que dê acesso à área; devolve os vínculos dessa área. */
export async function requireArea(area: Area): Promise<{ session: SessionContext; memberships: Membership[] }> {
  const session = await requireSession();
  const memberships = session.memberships.filter((m) => AREA_BY_ROLE[m.role] === area);
  if (memberships.length === 0) redirect("/inicio");
  return { session, memberships };
}

/**
 * Exige, dentro da área, um vínculo com um dos papéis informados.
 * Enquanto não houver troca de organização, usa o primeiro vínculo que atende.
 */
export async function requireOrgRole(
  area: Area,
  roles: MemberRole[],
): Promise<{ session: SessionContext; membership: Membership }> {
  const { session, memberships } = await requireArea(area);
  const membership = memberships.find((m) => roles.includes(m.role));
  if (!membership) redirect(`/${area}`);
  return { session, membership };
}

export function areasOf(session: SessionContext): Area[] {
  return [...new Set(session.memberships.map((m) => AREA_BY_ROLE[m.role]))];
}
