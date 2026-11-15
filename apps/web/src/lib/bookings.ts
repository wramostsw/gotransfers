/** Reservas, trechos, serviços e tarifas: rótulos, formatos e mensagens compartilhados por tela e servidor. */
import type { Tone } from "@/components/admin/kit";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ServiceKind = "airport_arrival" | "airport_departure" | "bus_arrival" | "bus_departure" | "point_to_point";
export type LocationKind = "airport" | "bus_station" | "hotel" | "address" | "other";
export type PricingMode = "fixed" | "distance" | "manual";
export type BookingStatus =
  | "draft"
  | "awaiting_quote"
  | "quoted"
  | "awaiting_payment"
  | "confirmed"
  | "partially_confirmed"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "disputed";
export type SegmentStatus = "awaiting_quote" | "quoted" | "confirmed" | "completed" | "cancelled";
export type ServiceStatus =
  | "created"
  | "awaiting_dispatch"
  | "offered"
  | "accepted"
  | "awaiting_assignment"
  | "assigned"
  | "driver_en_route"
  | "driver_arrived"
  | "boarding"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "failed"
  | "under_review";

export const SERVICE_KINDS: ServiceKind[] = ["airport_arrival", "airport_departure", "bus_arrival", "bus_departure", "point_to_point"];
export const SERVICE_KIND_LABEL: Record<ServiceKind, string> = {
  airport_arrival: "Chegada no aeroporto",
  airport_departure: "Ida ao aeroporto",
  bus_arrival: "Chegada na rodoviária",
  bus_departure: "Ida à rodoviária",
  point_to_point: "Ponto a ponto",
};

export const LOCATION_KINDS: LocationKind[] = ["airport", "bus_station", "hotel", "address", "other"];
export const LOCATION_KIND_LABEL: Record<LocationKind, string> = {
  airport: "Aeroporto",
  bus_station: "Rodoviária",
  hotel: "Hotel",
  address: "Endereço",
  other: "Outro",
};

export const PRICING_MODE_LABEL: Record<PricingMode, string> = {
  fixed: "Tabela fixa",
  distance: "Distância e tempo",
  manual: "Cotação manual",
};

export const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  draft: "Rascunho",
  awaiting_quote: "Aguardando cotação",
  quoted: "Cotada",
  awaiting_payment: "Aguardando pagamento",
  confirmed: "Confirmada",
  partially_confirmed: "Parcialmente confirmada",
  in_progress: "Em andamento",
  completed: "Concluída",
  cancelled: "Cancelada",
  disputed: "Em disputa",
};
export const BOOKING_STATUS_TONE: Record<BookingStatus, Tone> = {
  draft: "gray",
  awaiting_quote: "amber",
  quoted: "blue",
  awaiting_payment: "amber",
  confirmed: "green",
  partially_confirmed: "green",
  in_progress: "blue",
  completed: "gray",
  cancelled: "red",
  disputed: "red",
};

export const SEGMENT_STATUS_LABEL: Record<SegmentStatus, string> = {
  awaiting_quote: "Aguardando cotação",
  quoted: "Cotado",
  confirmed: "Confirmado",
  completed: "Concluído",
  cancelled: "Cancelado",
};
export const SEGMENT_STATUS_TONE: Record<SegmentStatus, Tone> = {
  awaiting_quote: "amber",
  quoted: "blue",
  confirmed: "green",
  completed: "gray",
  cancelled: "red",
};

export const SERVICE_STATUS_LABEL: Record<ServiceStatus, string> = {
  created: "Criado",
  awaiting_dispatch: "Aguardando distribuição",
  offered: "Ofertado",
  accepted: "Aceito pelo prestador",
  awaiting_assignment: "Aguardando designação",
  assigned: "Motorista designado",
  driver_en_route: "Motorista a caminho",
  driver_arrived: "Motorista chegou",
  boarding: "Em embarque",
  in_progress: "Em viagem",
  completed: "Concluído",
  cancelled: "Cancelado",
  failed: "Falha operacional",
  under_review: "Em análise",
};

export const LEDGER_ACCOUNT_LABEL: Record<string, string> = {
  agency_receivable: "A receber da agência",
  platform_revenue: "Taxa da plataforma",
  provider_accrual: "Repasse provisionado",
  provider_payable: "Repasse devido ao prestador",
};

export type LocationSnapshot = { kind: LocationKind; name: string; code: string | null; address_line: string | null; city: string; state: string };

/** Centavos → "R$ 1.234,56". */
export function formatMoney(cents: number | null | undefined) {
  if (cents === null || cents === undefined) return "—";
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Centavos → "1234,56" para preencher campos. */
export function moneyInput(cents: number | null | undefined) {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}

/** "1.234,56", "1234.56" ou "200" → centavos. Devolve NaN se não for um valor válido. */
export function parseMoney(text: string): number {
  const clean = text.replace(/[R$\s]/g, "");
  if (!clean) return NaN;
  const normalized = clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return NaN;
  return Math.round(Number(normalized) * 100);
}

/** Campo datetime-local (horário de Brasília) → instante em ISO. */
export function localToIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00-03:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function bookingError(message: string): string {
  if (message.includes("PASSENGER_NOT_FOUND")) return "Passageiro não encontrado nesta agência.";
  if (message.includes("INVALID_SEGMENTS")) return "Informe pelo menos um trecho.";
  if (message.includes("INVALID_LOCATION")) return "Origem e destino precisam ser locais ativos e diferentes.";
  if (message.includes("INVALID_CATEGORY")) return "Escolha uma categoria de veículo válida.";
  if (message.includes("PICKUP_TOO_SOON")) return "O horário do embarque está muito próximo ou já passou. Verifique a antecedência mínima.";
  if (message.includes("PICKUP_IN_PAST")) return "O horário de embarque de um trecho já passou.";
  if (message.includes("QUOTE_EXPIRED")) return "A cotação venceu. Recalcule o preço antes de confirmar.";
  if (message.includes("PRICE_INCONSISTENT")) return "O preço de um trecho está inconsistente. Fale com a equipe GoTransfer.";
  if (message.includes("INVALID_QUOTE")) return "Valores inválidos: o repasse não pode ser maior que o valor da agência.";
  if (message.includes("REASON_REQUIRED")) return "Informe o motivo.";
  if (message.includes("SERVICE_IN_EXECUTION")) return "O serviço já está em execução e não pode ser cancelado por aqui.";
  if (message.includes("INVALID_STATE")) return "Esta ação não é possível no estado atual da reserva.";
  if (message.includes("NOT_FOUND")) return "Registro não encontrado.";
  if (message.includes("NOT_ALLOWED") || message.includes("row-level security") || message.includes("permission denied"))
    return "Você não tem permissão para esta ação.";
  if (message.includes("violates check constraint")) return "Algum valor está fora do permitido. Revise os campos.";
  return "Não foi possível concluir. Tente de novo.";
}
