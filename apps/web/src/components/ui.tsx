import type { ComponentProps, ReactNode } from "react";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

type ButtonVariant = "primary" | "accent" | "secondary" | "danger" | "ghost";

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-brand-800 text-white hover:bg-brand-700 active:bg-brand-900",
  accent: "bg-accent-500 text-white hover:bg-accent-600",
  secondary: "border border-line bg-surface text-ink hover:bg-brand-50",
  danger: "border border-danger-700/30 bg-surface text-danger-700 hover:bg-danger-50",
  ghost: "text-brand-800 hover:bg-brand-50",
};

export function buttonClass(variant: ButtonVariant = "primary", size: "md" | "sm" = "md") {
  return cx(
    "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors",
    "disabled:cursor-not-allowed disabled:opacity-60",
    size === "md" ? "min-h-12 px-5 text-base" : "min-h-9 px-3 text-sm",
    BUTTON_VARIANT[variant],
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: "md" | "sm" }) {
  return <button className={cx(buttonClass(variant, size), className)} {...props} />;
}

export function Field({
  label,
  hint,
  className,
  ...props
}: ComponentProps<"input"> & { label: string; hint?: string }) {
  return (
    <label className={cx("flex flex-col gap-1.5 text-sm font-medium text-ink", className)}>
      {label}
      <input
        className="min-h-12 rounded-xl border border-line bg-surface px-4 text-base font-normal text-ink placeholder:text-muted/70"
        {...props}
      />
      {hint ? <span className="text-xs font-normal text-muted">{hint}</span> : null}
    </label>
  );
}

export function SelectField({
  label,
  children,
  className,
  ...props
}: ComponentProps<"select"> & { label: string }) {
  return (
    <label className={cx("flex flex-col gap-1.5 text-sm font-medium text-ink", className)}>
      {label}
      <select
        className="min-h-12 rounded-xl border border-line bg-surface px-3 text-base font-normal text-ink"
        {...props}
      >
        {children}
      </select>
    </label>
  );
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cx("rounded-(--radius-card) border border-line bg-surface p-5 shadow-(--shadow-card) sm:p-6", className)}
      {...props}
    />
  );
}

type Tone = "neutral" | "brand" | "success" | "warning" | "danger";

const TONE: Record<Tone, string> = {
  neutral: "bg-canvas text-muted",
  brand: "bg-brand-50 text-brand-800",
  success: "bg-success-50 text-success-700",
  warning: "bg-warning-50 text-warning-700",
  danger: "bg-danger-50 text-danger-700",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={cx("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold", TONE[tone])}>
      {children}
    </span>
  );
}

export function Alert({ tone = "danger", children }: { tone?: "danger" | "success" | "warning"; children: ReactNode }) {
  return (
    <p role={tone === "danger" ? "alert" : "status"} className={cx("rounded-xl px-4 py-3 text-sm font-medium", TONE[tone])}>
      {children}
    </p>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-(--radius-card) border border-dashed border-line bg-surface px-6 py-10 text-center">
      <p className="text-base font-semibold text-ink">{title}</p>
      {children ? <p className="mx-auto mt-1 max-w-md text-sm text-muted">{children}</p> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx("animate-pulse rounded-xl bg-line/70", className)} />;
}

const ORG_STATUS_TEXT: Record<string, string> = {
  pending: "está em análise",
  suspended: "está suspensa",
  blocked: "está bloqueada",
};

/** Aviso para empresas que não estão ativas: só consulta, sem cadastrar nem alterar. */
export function InactiveOrgNotice({ orgName, status }: { orgName: string; status: string }) {
  return (
    <div role="status" className="rounded-(--radius-card) border border-warning-700/30 bg-warning-50 px-5 py-4">
      <p className="text-base font-semibold text-warning-700">
        {orgName} {ORG_STATUS_TEXT[status] ?? "não está ativa"} no GoTransfer
      </p>
      <p className="mt-1 text-sm text-ink">
        Você pode consultar os dados, mas cadastros e alterações ficam travados até a empresa ser ativada. Fale com a
        equipe GoTransfer.
      </p>
    </div>
  );
}
