import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { formatDateTime } from "@/components/admin/kit";
import { AppShell, PageHeader, PageSkeleton } from "@/components/app-shell";
import { ReasonAction, SubmitAction } from "@/components/dispatch-forms";
import { ServiceBriefCard } from "@/components/service-brief";
import { EmptyState, InactiveOrgNotice, buttonClass } from "@/components/ui";
import { orgIsActive, requireOrgRole } from "@/lib/auth";
import { OFFER_STATUS_LABEL, OFFER_STATUS_TONE, type ProviderOffer } from "@/lib/dispatch";
import { respondOffer } from "@/lib/dispatch-actions";
import { CARRIER_NAV } from "@/lib/nav";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Ofertas" };

export default function OfertasPage() {
  return (
    <AppShell area="Portal da transportadora" nav={CARRIER_NAV}>
      <PageHeader
        title="Ofertas"
        description="Serviços oferecidos à sua empresa. Ao aceitar, você se compromete a designar motorista e veículo compatíveis."
        action={
          <Link href="/transportadora/ofertas" className={buttonClass("secondary", "sm")}>
            Atualizar
          </Link>
        }
      />
      <Suspense fallback={<PageSkeleton />}>
        <Content />
      </Suspense>
    </AppShell>
  );
}

async function Content() {
  const { membership } = await requireOrgRole("transportadora", ["carrier_admin", "carrier_dispatcher"]);
  const active = orgIsActive(membership);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("provider_offers", { p_org: membership.organization.id });
  const offers = (Array.isArray(data) ? data : []) as ProviderOffer[];
  const now = new Date().getTime();
  const open = offers.filter((o) => o.status === "pending" && o.expires_at && new Date(o.expires_at).getTime() > now);
  const past = offers.filter((o) => !open.includes(o));

  return (
    <div className="flex flex-col gap-6">
      {active ? null : <InactiveOrgNotice orgName={membership.organization.tradeName} status={membership.organization.status} />}
      {error ? (
        <EmptyState title="Não foi possível carregar as ofertas">Tente recarregar a página.</EmptyState>
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="text-base font-bold text-ink">Abertas ({open.length})</h2>
            {open.length === 0 ? (
              <EmptyState title="Nenhuma oferta aberta">Quando a GoTransfer oferecer um serviço à sua empresa, ele aparece aqui com o prazo para responder.</EmptyState>
            ) : (
              <ul className="grid gap-3 lg:grid-cols-2">
                {open.map((o) => (
                  <li key={o.offer_id}>
                    <ServiceBriefCard brief={o} badge={{ label: `Responder até ${formatDateTime(o.expires_at!)}`, tone: "amber" }} payoutCents={o.payout_cents}>
                      {active ? (
                        <div className="flex flex-col gap-2">
                          <SubmitAction action={respondOffer.bind(null, o.offer_id, true)} label="Aceitar serviço" pendingLabel="Aceitando…" />
                          <ReasonAction action={respondOffer.bind(null, o.offer_id, false)} summary="Recusar" button="Recusar oferta" required={false} tone="secondary" />
                        </div>
                      ) : null}
                    </ServiceBriefCard>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {past.length > 0 ? (
            <section className="flex flex-col gap-3">
              <h2 className="text-base font-bold text-ink">Respondidas e encerradas</h2>
              <ul className="grid gap-3 lg:grid-cols-2">
                {past.map((o) => {
                  const expired = o.status === "pending";
                  return (
                    <li key={o.offer_id} className="opacity-80">
                      <ServiceBriefCard
                        brief={o}
                        badge={expired ? { label: "Vencida", tone: "gray" } : { label: OFFER_STATUS_LABEL[o.status], tone: OFFER_STATUS_TONE[o.status] }}
                        payoutCents={o.payout_cents}
                      />
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
