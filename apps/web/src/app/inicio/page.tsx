import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AppShell, PageSkeleton } from "@/components/app-shell";
import { Badge, Card, EmptyState } from "@/components/ui";
import { areasOf, requireSession } from "@/lib/auth";
import { AREA_BY_ROLE, AREA_INFO, ORG_STATUS_LABEL, ROLE_LABEL } from "@/lib/roles";

export const metadata: Metadata = { title: "Início" };

export default function InicioPage() {
  return (
    <AppShell area="Início">
      <Suspense fallback={<PageSkeleton />}>
        <Areas />
      </Suspense>
    </AppShell>
  );
}

async function Areas() {
  const session = await requireSession();
  const areas = areasOf(session);
  const firstName = session.fullName.split(" ")[0];
  const isPlatformStaff = session.memberships.some((m) => m.organization.type === "platform");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Olá, {firstName}</h1>
        <p className="mt-1 text-sm text-muted">
          Escolha a área em que você vai trabalhar. Conectado como <span className="font-medium text-ink">{session.email}</span>.
        </p>
      </div>

      {areas.length === 0 ? (
        <EmptyState title="Seu acesso ainda não foi liberado">
          Sua conta está criada, mas ainda não está vinculada a nenhuma empresa. Peça ao administrador da sua agência
          ou transportadora, ou à equipe GoTransfer, para liberar o acesso do e-mail {session.email}.
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {areas.map((area) => {
            const info = AREA_INFO[area];
            const memberships = session.memberships.filter((m) => AREA_BY_ROLE[m.role] === area);
            return (
              <Link key={area} href={info.href} className="group rounded-(--radius-card)">
                <Card className="h-full transition-colors group-hover:border-brand-600">
                  <p className="text-lg font-bold text-ink">{info.title}</p>
                  <p className="mt-1 text-sm text-muted">{info.description}</p>
                  <ul className="mt-4 flex flex-col gap-2">
                    {memberships.map((m) => (
                      <li key={m.id} className="flex flex-wrap items-center gap-2 text-sm text-ink">
                        <span className="font-semibold">{m.organization.tradeName}</span>
                        <Badge tone="brand">{ROLE_LABEL[m.role]}</Badge>
                        {m.organization.status !== "active" ? (
                          <Badge tone="warning">{ORG_STATUS_LABEL[m.organization.status]}</Badge>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </Card>
              </Link>
            );
          })}
          {isPlatformStaff && !areas.includes("motorista") ? (
            <Link href="/motorista" className="group rounded-(--radius-card)">
              <Card className="h-full transition-colors group-hover:border-brand-600">
                <p className="text-lg font-bold text-ink">App do motorista</p>
                <p className="mt-1 text-sm text-muted">Veja o app como o motorista vê. Abra no celular para a experiência completa.</p>
                <div className="mt-4">
                  <Badge tone="warning">Demonstração · dados fictícios</Badge>
                </div>
              </Card>
            </Link>
          ) : null}
        </div>
      )}
    </div>
  );
}
