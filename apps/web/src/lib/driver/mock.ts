// Dados FICTÍCIOS do app do motorista (modo demonstração).
// Quando o motor de reservas e distribuição existir, estes dados virão do banco.
// Valores seguem a planilha do modelo: aeroporto R$ 250 ao passageiro -> R$ 152,00 ao prestador;
// rodoviária R$ 160 -> R$ 97,28.

export type ServiceKind = "airport_arrival" | "airport_departure" | "bus_station";

/** Etapas da execução, na ordem do PRD (seção 10.4). */
export type Step = "assigned" | "en_route" | "arrived" | "boarding" | "in_progress" | "completed";

export const STEP_ORDER: Step[] = ["assigned", "en_route", "arrived", "boarding", "in_progress", "completed"];

export type DriverService = {
  id: string;
  code: string;
  kind: ServiceKind;
  /** Dias a partir de hoje (0 = hoje). */
  dayOffset: number;
  time: string;
  pickup: { title: string; detail: string; meetingPoint?: string };
  dropoff: { title: string; detail: string };
  flight?: { number: string; info: string };
  passenger: { initials: string; name: string; count: number; language?: string };
  luggage: { large: number; medium: number };
  category: string;
  payoutCents: number;
  distanceKm: number;
  durationMin: number;
  toleranceMin: number;
  agencyNote?: string;
  step: Step;
};

export type Offer = {
  id: string;
  service: DriverService;
  /** Segundos para aceitar, contados a partir da abertura do app. */
  expiresInSec: number;
  distanceToPickupKm: number;
  pickupHint: string;
};

export const KIND_LABEL: Record<ServiceKind, string> = {
  airport_arrival: "Chegada no aeroporto",
  airport_departure: "Saída para o aeroporto",
  bus_station: "Rodoviária",
};

export const DRIVER = {
  name: "Carlos Mendes",
  firstName: "Carlos",
  initials: "CM",
  carrier: "Transportes Serra Azul",
  rating: "4,9",
  totalServices: 312,
  vehicle: { name: "Toyota Corolla prata", plate: "GTR-2E26", category: "Sedã", seats: 4, luggageLarge: 2 },
  languages: "Português, Inglês",
};

export const INITIAL_SERVICES: DriverService[] = [
  {
    id: "gt-48102",
    code: "GT-48102",
    kind: "airport_departure",
    dayOffset: 0,
    time: "09:15",
    pickup: { title: "Hotel Mar Azul", detail: "Rua do Porto, 88 · Orla" },
    dropoff: { title: "Aeroporto Internacional · T1", detail: "Embarque doméstico" },
    flight: { number: "GT 702", info: "decolagem 11:30" },
    passenger: { initials: "JP", name: "João Pereira", count: 2 },
    luggage: { large: 2, medium: 0 },
    category: "Sedã",
    payoutCents: 15200,
    distanceKm: 28,
    durationMin: 35,
    toleranceMin: 15,
    step: "completed",
  },
  {
    id: "gt-48190",
    code: "GT-48190",
    kind: "airport_arrival",
    dayOffset: 0,
    time: "14:30",
    pickup: {
      title: "Aeroporto Internacional · T2",
      detail: "Desembarque",
      meetingPoint: "Espere no portão B do desembarque com a placa com o nome do passageiro.",
    },
    dropoff: { title: "Hotel Central Plaza", detail: "Av. das Flores, 1200 · Centro" },
    flight: { number: "GT 1234", info: "pouso previsto 14:05" },
    passenger: { initials: "MS", name: "Marina Souza", count: 2, language: "Fala inglês" },
    luggage: { large: 2, medium: 1 },
    category: "Sedã",
    payoutCents: 15200,
    distanceKm: 32,
    durationMin: 40,
    toleranceMin: 60,
    agencyNote: "Cliente chega com carrinho de bebê dobrável. Tolerância de espera: 60 min após o pouso.",
    step: "assigned",
  },
];

export const INITIAL_OFFERS: Offer[] = [
  {
    id: "of-1",
    expiresInSec: 90,
    distanceToPickupKm: 6,
    pickupHint: "chegada do ônibus 18:00",
    service: {
      id: "gt-48213",
      code: "GT-48213",
      kind: "bus_station",
      dayOffset: 0,
      time: "18:10",
      pickup: {
        title: "Terminal Rodoviário · Plataforma B",
        detail: "Saída principal",
        meetingPoint: "Espere na saída principal da plataforma B.",
      },
      dropoff: { title: "Pousada Recanto Verde", detail: "Estrada do Mirante, km 4" },
      passenger: { initials: "AR", name: "Ana Ribeiro", count: 1 },
      luggage: { large: 1, medium: 1 },
      category: "Sedã",
      payoutCents: 9728,
      distanceKm: 12,
      durationMin: 25,
      toleranceMin: 30,
      step: "assigned",
    },
  },
  {
    id: "of-2",
    expiresInSec: 260,
    distanceToPickupKm: 14,
    pickupHint: "voo GT 870 às 08:15",
    service: {
      id: "gt-48255",
      code: "GT-48255",
      kind: "airport_departure",
      dayOffset: 1,
      time: "06:00",
      pickup: { title: "Hotel Serra Alta", detail: "Av. Beira-Mar, 400" },
      dropoff: { title: "Aeroporto Internacional · T1", detail: "Embarque doméstico" },
      flight: { number: "GT 870", info: "decolagem 08:15" },
      passenger: { initials: "LF", name: "Lucas Ferreira", count: 3 },
      luggage: { large: 3, medium: 1 },
      category: "SUV",
      payoutCents: 15200,
      distanceKm: 30,
      durationMin: 40,
      toleranceMin: 15,
      step: "assigned",
    },
  },
];

/** Outros dias da semana com serviços já agendados (só para os pontos da agenda). */
export const BUSY_DAY_OFFSETS = [1, 2, 4];

export type EarningItem = { title: string; when: string; cents: number; status: "paid" | "pending" | "held" };

export type EarningsPeriod = "day" | "week" | "month";

export const EARNINGS: Record<
  EarningsPeriod,
  { label: string; count: number; paid: number; pending: number; held: number; bars: number[]; barLabels: string[] }
> = {
  day: { label: "Hoje", count: 1, paid: 0, pending: 0, held: 15200, bars: [0, 0, 1, 0, 0, 0], barLabels: ["6h", "9h", "12h", "15h", "18h", "21h"] },
  week: {
    label: "Últimos 7 dias",
    count: 8,
    paid: 49856,
    pending: 40128,
    held: 15200,
    bars: [15200, 24928, 9728, 30400, 9728, 15200, 0],
    barLabels: ["S", "T", "Q", "Q", "S", "S", "D"],
  },
  month: {
    label: "Novembro",
    count: 31,
    paid: 312640,
    pending: 40128,
    held: 15200,
    bars: [88960, 104320, 104320, 70432],
    barLabels: ["Sem 1", "Sem 2", "Sem 3", "Sem 4"],
  },
};

export const EARNING_ITEMS: EarningItem[] = [
  { title: "Hotel Mar Azul → Aeroporto", when: "Hoje 09:15 · ocorrência em análise", cents: 15200, status: "held" },
  { title: "Rodoviária → Hotel Solar", when: "Ontem 19:40", cents: 9728, status: "pending" },
  { title: "Aeroporto → Resort Lagoa", when: "Há 2 dias · 16:20", cents: 15200, status: "pending" },
  { title: "Hotel Central → Aeroporto", when: "Há 4 dias · 05:30", cents: 15200, status: "paid" },
];

export type DocumentStatus = "approved" | "expiring" | "in_review";

export const DOCUMENTS: Array<{ id: string; title: string; detail: string; status: DocumentStatus }> = [
  { id: "cnh", title: "CNH categoria D", detail: "Aprovada · válida até 20/03/2028", status: "approved" },
  { id: "antecedentes", title: "Certidão de antecedentes", detail: "Aprovada · emitida em 02/09/2026", status: "approved" },
  { id: "curso", title: "Curso de transporte de passageiros", detail: "Vence em 12 dias", status: "expiring" },
];

export function formatMoney(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
