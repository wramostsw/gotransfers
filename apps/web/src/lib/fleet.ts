export type ApprovalStatus = "pending" | "approved" | "rejected";
export type VehicleStatus = "available" | "unavailable" | "maintenance";
export type DriverStatus = "active" | "inactive";

export const APPROVAL_LABEL: Record<ApprovalStatus, string> = {
  pending: "Em análise",
  approved: "Aprovado",
  rejected: "Reprovado",
};

export const APPROVAL_TONE: Record<ApprovalStatus, "warning" | "success" | "danger"> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
};

export const VEHICLE_STATUS_LABEL: Record<VehicleStatus, string> = {
  available: "Disponível",
  unavailable: "Indisponível",
  maintenance: "Em manutenção",
};

export const DRIVER_STATUS_LABEL: Record<DriverStatus, string> = {
  active: "Ativo",
  inactive: "Inativo",
};

export const LICENSE_CATEGORIES = ["B", "C", "D", "E", "AB", "AC", "AD", "AE"] as const;

export const LANGUAGES: Array<{ code: string; label: string }> = [
  { code: "pt", label: "Português" },
  { code: "en", label: "Inglês" },
  { code: "es", label: "Espanhol" },
  { code: "fr", label: "Francês" },
  { code: "it", label: "Italiano" },
  { code: "de", label: "Alemão" },
];

export const LANGUAGE_LABEL: Record<string, string> = Object.fromEntries(LANGUAGES.map((l) => [l.code, l.label]));

/** Placas brasileiras: ABC1234 (antiga) ou ABC1D23 (Mercosul). */
export const PLATE_RE = /^[A-Z]{3}\d[A-Z\d]\d{2}$/;

export function formatPlate(plate: string) {
  return plate.length === 7 ? `${plate.slice(0, 3)}-${plate.slice(3)}` : plate;
}

export function formatDate(isoDate: string) {
  const [y, m, d] = isoDate.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/** Texto e tom do selo de validade da CNH, sem depender só da cor. */
export function licenseBadge(isoDate: string, today: Date): { text: string; tone: "danger" | "warning" | "neutral" } {
  const days = daysUntil(isoDate, today);
  const date = formatDate(isoDate);
  if (days < 0) return { text: `CNH vencida em ${date}`, tone: "danger" };
  if (days === 0) return { text: `CNH vence hoje (${date})`, tone: "warning" };
  if (days <= 30) return { text: `CNH vence em ${days} ${days === 1 ? "dia" : "dias"} (${date})`, tone: "warning" };
  return { text: `CNH válida até ${date}`, tone: "neutral" };
}

/** Dias até a data (negativo = já venceu). Compara só as datas, sem horário. */
export function daysUntil(isoDate: string, today: Date) {
  const target = Date.UTC(Number(isoDate.slice(0, 4)), Number(isoDate.slice(5, 7)) - 1, Number(isoDate.slice(8, 10)));
  const base = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target - base) / 86_400_000);
}
