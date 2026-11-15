import { ROLE_LABEL, type MemberRole } from "@/lib/roles";

export type AuditRow = {
  id: number;
  occurred_at: string;
  actor_id: string | null;
  organization_id: string | null;
  action: "insert" | "update" | "delete";
  entity: string;
  entity_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
};

export const ENTITY_LABEL: Record<string, string> = {
  organizations: "Organização",
  memberships: "Acesso",
  vehicles: "Veículo",
  drivers: "Motorista",
  vehicle_categories: "Categoria de veículo",
  platform_settings: "Configuração",
};

export const ACTION_LABEL: Record<AuditRow["action"], string> = { insert: "Criou", update: "Alterou", delete: "Removeu" };

const ORG_STATUS_VERB: Record<string, string> = {
  active: "ativou",
  suspended: "suspendeu",
  blocked: "bloqueou",
  pending: "colocou em análise",
};

/** Campos técnicos que não interessam a quem lê o histórico. */
const HIDDEN_FIELDS = new Set(["updated_at", "created_at", "created_by", "reviewed_by", "reviewed_at", "id", "organization_id"]);

function str(v: unknown) {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

/** Frase curta do que aconteceu, sem o nome de quem fez (ex.: "aprovou o veículo ABC1D23"). */
export function describeAudit(row: AuditRow): string {
  const n = row.new_data ?? {};
  const o = row.old_data ?? {};
  const changed = (k: string) => str(o[k]) !== str(n[k]);
  switch (row.entity) {
    case "organizations": {
      const name = str(n.trade_name || o.trade_name);
      if (row.action === "insert") return `cadastrou a organização ${name}`;
      if (row.action === "update" && changed("status")) return `${ORG_STATUS_VERB[str(n.status)] ?? "alterou o status de"} ${name}`;
      return `alterou os dados de ${name}`;
    }
    case "memberships": {
      const role = ROLE_LABEL[str(n.role || o.role) as MemberRole] ?? "acesso";
      if (row.action === "insert") return `liberou um acesso de ${role.toLowerCase()}`;
      if (row.action === "update" && changed("status")) {
        return str(n.status) === "revoked" ? `removeu um acesso de ${role.toLowerCase()}` : `reativou um acesso de ${role.toLowerCase()}`;
      }
      return `alterou um acesso de ${role.toLowerCase()}`;
    }
    case "vehicles": {
      const plate = str(n.plate || o.plate);
      if (row.action === "insert") return `cadastrou o veículo ${plate}`;
      if (changed("approval_status")) {
        if (str(n.approval_status) === "approved") return `aprovou o veículo ${plate}`;
        if (str(n.approval_status) === "rejected") return `reprovou o veículo ${plate}`;
        return `devolveu para análise o veículo ${plate}`;
      }
      if (changed("status")) return `mudou a disponibilidade do veículo ${plate}`;
      return `alterou o veículo ${plate}`;
    }
    case "drivers": {
      const name = str(n.full_name || o.full_name);
      if (row.action === "insert") return `cadastrou o motorista ${name}`;
      if (changed("approval_status")) {
        if (str(n.approval_status) === "approved") return `aprovou o motorista ${name}`;
        if (str(n.approval_status) === "rejected") return `reprovou o motorista ${name}`;
        return `devolveu para análise o motorista ${name}`;
      }
      if (changed("user_id") && n.user_id) return `liberou o app para ${name}`;
      if (changed("status")) return `${str(n.status) === "active" ? "reativou" : "desativou"} o motorista ${name}`;
      return `alterou o motorista ${name}`;
    }
    case "vehicle_categories":
      return `${row.action === "insert" ? "criou" : "alterou"} a categoria ${str(n.name || o.name)}`;
    case "platform_settings":
      return `alterou a configuração ${str(n.key || o.key)}`;
    default:
      return `${ACTION_LABEL[row.action].toLowerCase()} ${row.entity}`;
  }
}

/** Lista de campos que mudaram: antes e depois. */
export function auditDiff(row: AuditRow): Array<{ field: string; before: string; after: string }> {
  const o = row.old_data ?? {};
  const n = row.new_data ?? {};
  const keys = [...new Set([...Object.keys(o), ...Object.keys(n)])].filter((k) => !HIDDEN_FIELDS.has(k));
  return keys
    .filter((k) => JSON.stringify(o[k] ?? null) !== JSON.stringify(n[k] ?? null))
    .map((k) => ({ field: k, before: o[k] == null ? "—" : JSON.stringify(o[k]), after: n[k] == null ? "—" : JSON.stringify(n[k]) }));
}
