import "server-only";
import type { LocationSnapshot } from "@/lib/bookings";
import type { ServiceBrief } from "@/lib/dispatch";
import type { DriverProfile, DriverService, ServiceKind, Step } from "@/lib/driver/mock";
import { formatPlate } from "@/lib/fleet";
import { createClient } from "@/lib/supabase/server";

const STEP_BY_STATUS: Record<string, Step> = {
  assigned: "assigned",
  driver_en_route: "en_route",
  driver_arrived: "arrived",
  boarding: "boarding",
  in_progress: "in_progress",
  completed: "completed",
};

const KIND: Record<string, ServiceKind> = {
  airport_arrival: "airport_arrival",
  airport_departure: "airport_departure",
  bus_arrival: "bus_station",
  bus_departure: "bus_station",
  point_to_point: "point_to_point",
};

const TZ = "America/Sao_Paulo";

function dayKey(date: Date) {
  return date.toLocaleDateString("en-CA", { timeZone: TZ });
}

function dayDiff(from: Date, to: Date) {
  const a = Date.parse(`${dayKey(from)}T00:00:00Z`);
  const b = Date.parse(`${dayKey(to)}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "?"
  );
}

function place(p: LocationSnapshot) {
  return {
    title: p.code ? `${p.name} (${p.code})` : p.name,
    detail: [p.address_line, `${p.city}/${p.state}`].filter(Boolean).join(" · "),
  };
}

type DriverRow = {
  id: string;
  full_name: string;
  license_category: string;
  license_expires_at: string;
  languages: string[];
  approval_status: string;
  organization: { trade_name: string; is_individual: boolean } | null;
};

const LANGUAGE: Record<string, string> = { pt: "Português", en: "Inglês", es: "Espanhol", fr: "Francês", it: "Italiano", de: "Alemão" };

/**
 * Dados reais do motorista logado. Devolve null quando a conta não está ligada a um
 * cadastro de motorista (nesse caso o app só abre em demonstração para a equipe GoTransfer).
 */
export async function loadDriverLive(userId: string): Promise<{ profile: DriverProfile; services: DriverService[] } | null> {
  const supabase = await createClient();
  const { data: driver } = await supabase
    .from("drivers")
    .select("id, full_name, license_category, license_expires_at, languages, approval_status, organization:organizations(trade_name, is_individual)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<DriverRow>();
  if (!driver) return null;

  const [{ data: raw }, { data: settings }] = await Promise.all([
    supabase.rpc("driver_services"),
    supabase.from("platform_settings").select("key, value").in("key", ["wait_tolerance_airport_min", "wait_tolerance_bus_station_min"]),
  ]);
  const tolerance = new Map((settings ?? []).map((s: { key: string; value: unknown }) => [s.key, Number(s.value)]));
  const briefs = (Array.isArray(raw) ? raw : []) as ServiceBrief[];
  const now = new Date();

  const services: DriverService[] = briefs
    .filter((b) => STEP_BY_STATUS[b.status])
    .map((b) => {
      const pickup = new Date(b.pickup_at);
      const kind = KIND[b.service_kind] ?? "point_to_point";
      const name = b.passenger?.name ?? "Passageiro";
      return {
        id: b.service_id,
        code: b.booking_code,
        kind,
        dayOffset: dayDiff(now, pickup),
        time: pickup.toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }),
        pickup: place(b.origin),
        dropoff: place(b.destination),
        flight: b.trip_reference ? { number: b.trip_reference, info: "informado pela agência" } : undefined,
        passenger: { initials: initials(name), name, count: b.pax_count, phone: b.passenger?.phone ?? null },
        luggage: { large: b.luggage_large, medium: b.luggage_medium },
        category: b.category,
        payoutCents: b.payout_cents ?? null,
        distanceKm: b.distance_km,
        durationMin: b.duration_min,
        toleranceMin:
          kind === "bus_station"
            ? (tolerance.get("wait_tolerance_bus_station_min") ?? 30)
            : kind === "point_to_point"
              ? 15
              : (tolerance.get("wait_tolerance_airport_min") ?? 60),
        agencyNote: b.notes ?? undefined,
        step: STEP_BY_STATUS[b.status],
      };
    });

  const next = briefs.find((b) => b.status !== "completed" && b.vehicle) ?? briefs.find((b) => b.vehicle);
  const expires = new Date(`${driver.license_expires_at}T12:00:00-03:00`);
  const daysLeft = dayDiff(now, expires);
  const firstName = driver.full_name.split(/\s+/)[0] ?? driver.full_name;

  const profile: DriverProfile = {
    name: driver.full_name,
    firstName,
    initials: initials(driver.full_name),
    carrier: driver.organization?.trade_name ?? "Transportadora",
    rating: null,
    totalServices: services.filter((s) => s.step === "completed").length,
    vehicle: next?.vehicle
      ? { name: next.vehicle.label, plate: formatPlate(next.vehicle.plate), category: next.category, seats: 0, luggageLarge: 0 }
      : null,
    languages: (driver.languages ?? []).map((l) => LANGUAGE[l] ?? l).join(", ") || "Português",
    documents: [
      {
        id: "cnh",
        title: `CNH categoria ${driver.license_category}`,
        detail: daysLeft < 0 ? "Vencida" : `Válida até ${expires.toLocaleDateString("pt-BR", { timeZone: TZ })}`,
        status: daysLeft < 0 ? "in_review" : daysLeft <= 30 ? "expiring" : "approved",
      },
    ],
    isIndividual: Boolean(driver.organization?.is_individual),
  };
  return { profile, services };
}
