import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { Icon } from "@/components/icons";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export type Crumb = { label: string; href?: string };

export function AdminHeader({
  title,
  description,
  crumbs,
  actions,
}: {
  title: string;
  description?: string;
  crumbs?: Crumb[];
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      {crumbs?.length ? (
        <nav aria-label="Caminho" className="flex flex-wrap items-center gap-1.5 text-[13px] text-muted">
          {crumbs.map((c, i) => (
            <span key={c.label} className="flex items-center gap-1.5">
              {i > 0 ? <Icon name="chevronRight" size={14} strokeWidth={2} /> : null}
              {c.href ? (
                <Link href={c.href} className="hover:text-brand-800 hover:underline">
                  {c.label}
                </Link>
              ) : (
                <span className="font-semibold text-ink">{c.label}</span>
              )}
            </span>
          ))}
        </nav>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-[28px] font-extrabold tracking-tight">{title}</h1>
          {description ? <p className="mt-1 max-w-3xl text-sm text-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2.5">{actions}</div> : null}
      </div>
    </div>
  );
}

export function Panel({ className, ...props }: ComponentProps<"section">) {
  return <section className={cx("overflow-hidden rounded-2xl border border-line bg-surface", className)} {...props} />;
}

export function PanelHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EEF1F7] px-5 py-4">
      <div>
        <h2 className="text-base font-bold">{title}</h2>
        {description ? <p className="mt-0.5 text-[13px] text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export type Tone = "green" | "amber" | "red" | "blue" | "gray" | "orange";

const TONES: Record<Tone, string> = {
  green: "bg-success-50 text-success-700",
  amber: "bg-warning-50 text-warning-700",
  red: "bg-danger-50 text-[#8C1D16]",
  blue: "bg-[#E8EEFF] text-brand-800",
  gray: "bg-[#F1F4F9] text-[#33405F]",
  orange: "bg-accent-50 text-accent-800",
};

export function Pill({ tone = "gray", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cx("inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold", TONES[tone])}>{children}</span>;
}

export const btn = {
  primary:
    "inline-flex h-10 items-center justify-center gap-2 rounded-[10px] bg-brand-800 px-4 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-60",
  secondary:
    "inline-flex h-10 items-center justify-center gap-2 rounded-[10px] border border-[#DCE2EE] bg-surface px-3.5 text-sm font-semibold text-ink hover:bg-brand-50 disabled:opacity-60",
  danger:
    "inline-flex h-10 items-center justify-center gap-2 rounded-[10px] border border-[#F3C3BF] bg-surface px-3.5 text-sm font-semibold text-danger-700 hover:bg-danger-50 disabled:opacity-60",
  small:
    "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[#DCE2EE] bg-surface px-3 text-[13px] font-semibold text-ink hover:bg-brand-50",
};

/** Tabela com rolagem horizontal no celular. */
export function DataTable({ children, minWidth = 760 }: { children: ReactNode; minWidth?: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm" style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

export function Th({ children, align = "left", className }: { children?: ReactNode; align?: "left" | "right"; className?: string }) {
  return (
    <th
      scope="col"
      className={cx(
        "whitespace-nowrap bg-[#F8FAFD] px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-muted first:pl-5 last:pr-5",
        align === "right" ? "text-right" : "text-left",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, align = "left", className }: { children?: ReactNode; align?: "left" | "right"; className?: string }) {
  return (
    <td className={cx("border-t border-[#F1F4F9] px-3 py-3 align-middle first:pl-5 last:pr-5", align === "right" && "text-right tabular-nums", className)}>
      {children}
    </td>
  );
}

export type TabItem = { label: string; href: string; count?: number; active?: boolean };

export function TabsNav({ items, label }: { items: TabItem[]; label: string }) {
  return (
    <nav aria-label={label} className="flex gap-1 overflow-x-auto border-b border-[#EEF1F7] px-4">
      {items.map((t) => (
        <Link
          key={t.label}
          href={t.href}
          aria-current={t.active ? "page" : undefined}
          className={cx(
            "flex h-12 items-center gap-2 whitespace-nowrap px-3 text-sm",
            t.active ? "font-bold text-brand-800 shadow-[inset_0_-2px_0_#00268E]" : "font-semibold text-muted hover:text-ink",
          )}
        >
          {t.label}
          {t.count !== undefined ? (
            <span className={cx("rounded-full px-1.5 py-px text-xs font-bold", t.active ? "bg-[#E8EEFF] text-brand-800" : "bg-[#F1F4F9] text-muted")}>
              {t.count}
            </span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  makeHref,
}: {
  page: number;
  pageSize: number;
  total: number;
  makeHref: (page: number) => string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const near = [page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages);
  const cell = "grid size-8.5 place-items-center rounded-lg text-sm";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#EEF1F7] px-5 py-3 text-[13px] text-muted">
      <span>
        Mostrando {from}–{to} de {total}
      </span>
      <nav aria-label="Paginação" className="flex items-center gap-1.5">
        {page > 1 ? (
          <Link href={makeHref(page - 1)} aria-label="Página anterior" className={cx(cell, "border border-[#DCE2EE] bg-surface text-ink")}>
            <Icon name="chevronLeft" size={16} strokeWidth={2} />
          </Link>
        ) : null}
        {near.map((p) => (
          <Link
            key={p}
            href={makeHref(p)}
            aria-current={p === page ? "page" : undefined}
            className={cx(cell, p === page ? "bg-brand-800 font-bold text-white" : "border border-[#DCE2EE] bg-surface text-ink")}
          >
            {p}
          </Link>
        ))}
        {page < pages ? (
          <Link href={makeHref(page + 1)} aria-label="Próxima página" className={cx(cell, "border border-[#DCE2EE] bg-surface text-ink")}>
            <Icon name="chevronRight" size={16} strokeWidth={2} />
          </Link>
        ) : null}
      </nav>
    </div>
  );
}

export function EmptyRow({ colSpan, title, children }: { colSpan: number; title: string; children?: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="border-t border-[#F1F4F9] px-5 py-12 text-center">
        <p className="font-semibold">{title}</p>
        {children ? <p className="mx-auto mt-1 max-w-md text-sm text-muted">{children}</p> : null}
      </td>
    </tr>
  );
}

export function Avatar({ text, color = "#004AD0", rounded = "rounded-[10px]" }: { text: string; color?: string; rounded?: string }) {
  return (
    <span aria-hidden className={cx("grid size-8.5 shrink-0 place-items-center text-xs font-extrabold text-white", rounded)} style={{ background: color }}>
      {text}
    </span>
  );
}

const AVATAR_COLORS = ["#004AD0", "#C2410C", "#0B7A53", "#6D28D9", "#0E7490", "#B45309"];

export function avatarColor(seed: string) {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter((w) => /[A-Za-zÀ-ú]/.test(w[0] ?? ""))
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "?"
  );
}

export function AdminSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Carregando">
      <div className="h-9 w-64 animate-pulse rounded-xl bg-line/70" />
      <div className="grid gap-4 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-line/60" />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-2xl bg-line/60" />
    </div>
  );
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}
