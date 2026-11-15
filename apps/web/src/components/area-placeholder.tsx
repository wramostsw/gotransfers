import { Suspense } from "react";
import { AppShell, PageHeader, PageSkeleton, type NavItem } from "@/components/app-shell";
import { Badge, Card } from "@/components/ui";
import { requireArea } from "@/lib/auth";
import { ORG_STATUS_LABEL, ROLE_LABEL, type Area } from "@/lib/roles";

type Props = {
  area: Area;
  title: string;
  description: string;
  upcoming: Array<{ phase: string; items: string }>;
  nav?: NavItem[];
};

/** Página inicial das áreas cujas funcionalidades entram nas próximas fases do roadmap. */
export function AreaPlaceholder(props: Props) {
  return (
    <AppShell area={props.title} nav={props.nav}>
      <PageHeader title={props.title} description={props.description} />
      <Suspense fallback={<PageSkeleton />}>
        <Content area={props.area} title={props.title} description={props.description} upcoming={props.upcoming} />
      </Suspense>
    </AppShell>
  );
}

async function Content({ area, upcoming }: Omit<Props, "nav">) {
  const { memberships } = await requireArea(area);
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        {memberships.map((m) => (
          <Card key={m.id}>
            <p className="text-lg font-bold text-ink">{m.organization.tradeName}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge tone="brand">{ROLE_LABEL[m.role]}</Badge>
              <Badge tone={m.organization.status === "active" ? "success" : "warning"}>
                {ORG_STATUS_LABEL[m.organization.status]}
              </Badge>
            </div>
          </Card>
        ))}
      </div>
      <Card>
        <p className="text-base font-semibold text-ink">Em construção</p>
        <ul className="mt-3 flex flex-col gap-2 text-sm text-muted">
          {upcoming.map((u) => (
            <li key={u.phase}>
              <span className="font-semibold text-ink">{u.phase}:</span> {u.items}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
