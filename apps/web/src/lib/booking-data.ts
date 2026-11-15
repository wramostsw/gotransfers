import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookingStatus, LocationSnapshot, PricingMode, SegmentStatus, ServiceKind, ServiceStatus } from "@/lib/bookings";
import { UUID_RE } from "@/lib/bookings";
import { likePattern } from "@/lib/query";

export type BookingListRow = {
  id: string;
  code: string;
  status: BookingStatus;
  total_cents: number;
  created_at: string;
  agency: { trade_name: string } | null;
  passenger: { full_name: string } | null;
  segments: Array<{ pickup_at: string; status: SegmentStatus; origin_snapshot: LocationSnapshot; destination_snapshot: LocationSnapshot }>;
};

export const BOOKING_TABS = [
  { key: "todas", label: "Todas", statuses: null },
  { key: "cotacao", label: "Aguardando cotação", statuses: ["awaiting_quote"] },
  { key: "cotadas", label: "Cotadas", statuses: ["quoted"] },
  { key: "confirmadas", label: "Confirmadas", statuses: ["confirmed", "partially_confirmed", "in_progress"] },
  { key: "encerradas", label: "Encerradas", statuses: ["completed", "cancelled", "disputed"] },
] as const;
export type BookingTabKey = (typeof BOOKING_TABS)[number]["key"];

/** Lista paginada de reservas. O RLS já limita ao que o usuário pode ver. */
export async function listBookings(
  supabase: SupabaseClient,
  opts: { tab: BookingTabKey; q: string; page: number; pageSize: number; agencyId?: string },
) {
  const tab = BOOKING_TABS.find((t) => t.key === opts.tab) ?? BOOKING_TABS[0];
  let query = supabase
    .from("bookings")
    .select(
      "id, code, status, total_cents, created_at, agency:organizations(trade_name), passenger:passengers(full_name), segments:booking_segments(pickup_at, status, origin_snapshot, destination_snapshot)",
      { count: "exact" },
    );
  if (opts.agencyId) query = query.eq("agency_id", opts.agencyId);
  if (tab.statuses) query = query.in("status", tab.statuses as unknown as string[]);
  if (opts.q) query = query.ilike("code", likePattern(opts.q));
  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .range((opts.page - 1) * opts.pageSize, opts.page * opts.pageSize - 1)
    .returns<BookingListRow[]>();
  return { rows: data ?? [], total: count ?? 0, error };
}

/** Contagem por aba, para os selos. */
export async function countBookings(supabase: SupabaseClient, agencyId?: string) {
  const counts = await Promise.all(
    BOOKING_TABS.map(async (tab) => {
      let query = supabase.from("bookings").select("id", { count: "exact", head: true });
      if (agencyId) query = query.eq("agency_id", agencyId);
      if (tab.statuses) query = query.in("status", tab.statuses as unknown as string[]);
      const { count } = await query;
      return [tab.key, count ?? 0] as const;
    }),
  );
  return Object.fromEntries(counts) as Record<BookingTabKey, number>;
}

export type BookingRecord = {
  id: string;
  code: string;
  status: BookingStatus;
  total_cents: number;
  external_ref: string | null;
  created_at: string;
  confirmed_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  agency_id: string;
  agency: { trade_name: string } | null;
  passenger: { full_name: string; phone: string | null; email: string | null } | null;
};

export type SegmentRecord = {
  id: string;
  position: number;
  service_kind: ServiceKind;
  origin_snapshot: LocationSnapshot;
  destination_snapshot: LocationSnapshot;
  pickup_at: string;
  trip_reference: string | null;
  pax_count: number;
  luggage_large: number;
  luggage_medium: number;
  needs_accessible: boolean;
  child_seats: number;
  notes: string | null;
  distance_km: number | null;
  duration_min: number | null;
  pricing_mode: PricingMode;
  sale_price_cents: number | null;
  quote_valid_until: string | null;
  status: SegmentStatus;
  cancel_reason: string | null;
  category: { name: string } | null;
};

export type ServiceRecord = { id: string; segment_id: string; status: ServiceStatus };
export type ServiceEventRecord = {
  id: number;
  service_id: string;
  from_status: ServiceStatus | null;
  to_status: ServiceStatus;
  origin: string;
  reason: string | null;
  occurred_at: string;
};

export async function loadBooking(supabase: SupabaseClient, bookingId: string) {
  if (!UUID_RE.test(bookingId)) return null;
  const [booking, segments, services, events] = await Promise.all([
    supabase
      .from("bookings")
      .select(
        "id, code, status, total_cents, external_ref, created_at, confirmed_at, cancelled_at, cancel_reason, agency_id, agency:organizations(trade_name), passenger:passengers(full_name, phone, email)",
      )
      .eq("id", bookingId)
      .maybeSingle<BookingRecord>(),
    supabase
      .from("booking_segments")
      .select(
        "id, position, service_kind, origin_snapshot, destination_snapshot, pickup_at, trip_reference, pax_count, luggage_large, luggage_medium, needs_accessible, child_seats, notes, distance_km, duration_min, pricing_mode, sale_price_cents, quote_valid_until, status, cancel_reason, category:vehicle_categories(name)",
      )
      .eq("booking_id", bookingId)
      .order("position")
      .returns<SegmentRecord[]>(),
    supabase.from("services").select("id, segment_id, status").eq("booking_id", bookingId).order("created_at").returns<ServiceRecord[]>(),
    supabase
      .from("service_events")
      .select("id, service_id, from_status, to_status, origin, reason, occurred_at, service:services!inner(booking_id)")
      .eq("service.booking_id", bookingId)
      .order("occurred_at")
      .returns<ServiceEventRecord[]>(),
  ]);
  if (!booking.data) return null;
  return { booking: booking.data, segments: segments.data ?? [], services: services.data ?? [], events: events.data ?? [] };
}
