/** Distribuição, ofertas e designação: rótulos, tipos e mensagens compartilhados. */
import type { Tone } from "@/components/admin/kit";
import type { LocationSnapshot, ServiceKind, ServiceStatus } from "@/lib/bookings";

export type DistributionMode = "simultaneous" | "sequential" | "directed" | "manual";
export type OfferStatus = "queued" | "pending" | "accepted" | "declined" | "expired" | "cancelled";

export const MODE_LABEL: Record<DistributionMode, string> = {
  simultaneous: "Simultânea",
  sequential: "Sequencial",
  directed: "Direcionada",
  manual: "Manual",
};

export const OFFER_STATUS_LABEL: Record<OfferStatus, string> = {
  queued: "Na fila",
  pending: "Aguardando resposta",
  accepted: "Aceita",
  declined: "Recusada",
  expired: "Vencida",
  cancelled: "Encerrada",
};
export const OFFER_STATUS_TONE: Record<OfferStatus, Tone> = {
  queued: "gray",
  pending: "amber",
  accepted: "green",
  declined: "red",
  expired: "gray",
  cancelled: "gray",
};

export const SERVICE_STATUS_TONE: Record<ServiceStatus, Tone> = {
  created: "gray",
  awaiting_dispatch: "amber",
  offered: "blue",
  accepted: "blue",
  awaiting_assignment: "amber",
  assigned: "green",
  driver_en_route: "blue",
  driver_arrived: "blue",
  boarding: "blue",
  in_progress: "blue",
  completed: "gray",
  cancelled: "red",
  failed: "red",
  under_review: "amber",
};

/** Abas da central de serviços e da agenda da transportadora. */
export const SERVICE_TABS = [
  { key: "distribuir", label: "A distribuir", statuses: ["awaiting_dispatch"] },
  { key: "ofertados", label: "Ofertados", statuses: ["offered"] },
  { key: "designar", label: "Aguardando designação", statuses: ["accepted", "awaiting_assignment"] },
  { key: "designados", label: "Designados", statuses: ["assigned"] },
  { key: "execucao", label: "Em execução", statuses: ["driver_en_route", "driver_arrived", "boarding", "in_progress"] },
  { key: "encerrados", label: "Encerrados", statuses: ["completed", "cancelled", "failed", "under_review"] },
] as const;
export type ServiceTabKey = (typeof SERVICE_TABS)[number]["key"];

/** O que a transportadora e o motorista recebem sobre um serviço (sem preço da agência). */
export type ServiceBrief = {
  service_id: string;
  status: ServiceStatus;
  booking_code: string;
  pickup_at: string;
  service_kind: ServiceKind;
  origin: LocationSnapshot;
  destination: LocationSnapshot;
  pax_count: number;
  luggage_large: number;
  luggage_medium: number;
  category: string;
  needs_accessible: boolean;
  child_seats: number;
  distance_km: number | null;
  duration_min: number | null;
  trip_reference: string | null;
  provider_org_id: string | null;
  driver: { id: string; name: string } | null;
  vehicle: { id: string; label: string; plate: string } | null;
  notes?: string | null;
  passenger?: { name: string; phone: string | null };
  payout_cents?: number | null;
};

export type ProviderOffer = Omit<ServiceBrief, "status"> & {
  offer_id: string;
  status: OfferStatus;
  service_status: ServiceStatus;
  mode: DistributionMode;
  payout_cents: number;
  expires_at: string | null;
  responded_at: string | null;
};

export function dispatchError(message: string): string {
  if (message.includes("NO_ELIGIBLE_PROVIDER")) return "Nenhum prestador escolhido pode atender: falta veículo compatível aprovado ou motorista com CNH válida.";
  if (message.includes("INVALID_DISPATCH")) return "Configuração inválida: a oferta direcionada precisa de exatamente um prestador.";
  if (message.includes("OFFER_EXPIRED")) return "O prazo desta oferta acabou.";
  if (message.includes("OFFER_UNAVAILABLE")) return "Esta oferta não está mais disponível. Outro prestador pode ter aceitado antes.";
  if (message.includes("DRIVER_NOT_ELIGIBLE")) return "Este motorista não pode ser designado: precisa estar aprovado, ativo e com a CNH válida no dia do serviço.";
  if (message.includes("VEHICLE_NOT_ELIGIBLE")) return "Este veículo não atende ao serviço: confira aprovação, categoria, lugares, malas e requisitos especiais.";
  if (message.includes("SCHEDULE_CONFLICT")) return "Conflito de agenda: o motorista ou o veículo já tem outro serviço perto deste horário.";
  if (message.includes("INVALID_TRANSITION")) return "Esta etapa não pode ser feita agora. Siga a ordem do serviço.";
  if (message.includes("REASON_REQUIRED")) return "Informe a justificativa.";
  if (message.includes("INVALID_STATE")) return "Esta ação não é possível no estado atual do serviço.";
  if (message.includes("NOT_FOUND")) return "Serviço não encontrado.";
  if (message.includes("NOT_ALLOWED") || message.includes("permission denied")) return "Você não tem permissão para esta ação.";
  return "Não foi possível concluir. Tente de novo.";
}
