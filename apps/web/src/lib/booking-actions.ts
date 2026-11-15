"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireArea } from "@/lib/auth";
import { LOCATION_KINDS, SERVICE_KINDS, UUID_RE, bookingError, localToIso, parseMoney, type LocationKind, type ServiceKind } from "@/lib/bookings";
import { withValues, type FormValues } from "@/lib/form-values";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; success?: string; values?: FormValues };
type Portal = "admin" | "agencia";

const OPERATORS = ["agency_admin", "agency_agent"];

function text(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function refresh(portal: Portal, bookingId: string) {
  revalidatePath(`/${portal}/reservas`);
  revalidatePath(`/${portal}/reservas/${bookingId}`);
}

/** Agência do usuário que pode operar reservas (administrador ou agente). */
async function operatingAgency() {
  const { memberships } = await requireArea("agencia");
  return memberships.find((m) => OPERATORS.includes(m.role)) ?? null;
}

// ---------------------------------------------------------------------------
// Reservas (as permissões de verdade são conferidas dentro das funções do banco)
// ---------------------------------------------------------------------------
export async function confirmBooking(portal: Portal, bookingId: string): Promise<FormState> {
  await requireArea(portal);
  if (!UUID_RE.test(bookingId)) return { error: "Reserva inválida." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_booking", { p_booking: bookingId });
  if (error) return { error: bookingError(error.message) };
  refresh(portal, bookingId);
  return { success: "Reserva confirmada." };
}

export async function refreshQuote(portal: Portal, bookingId: string): Promise<FormState> {
  await requireArea(portal);
  if (!UUID_RE.test(bookingId)) return { error: "Reserva inválida." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("refresh_quote", { p_booking: bookingId });
  if (error) return { error: bookingError(error.message) };
  refresh(portal, bookingId);
  return { success: "Preços recalculados." };
}

export async function cancelBooking(portal: Portal, bookingId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireArea(portal);
  const reason = text(formData, "reason");
  if (!UUID_RE.test(bookingId)) return { error: "Reserva inválida." };
  if (reason.length < 3) return { error: "Informe o motivo do cancelamento." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_booking", { p_booking: bookingId, p_reason: reason.slice(0, 500) });
  if (error) return withValues({ error: bookingError(error.message) }, formData);
  refresh(portal, bookingId);
  return { success: "Reserva cancelada." };
}

export async function cancelSegment(
  portal: Portal,
  bookingId: string,
  segmentId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireArea(portal);
  const reason = text(formData, "reason");
  if (!UUID_RE.test(bookingId) || !UUID_RE.test(segmentId)) return { error: "Trecho inválido." };
  if (reason.length < 3) return { error: "Informe o motivo do cancelamento." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_segment", { p_segment: segmentId, p_reason: reason.slice(0, 500) });
  if (error) return withValues({ error: bookingError(error.message) }, formData);
  refresh(portal, bookingId);
  return { success: "Trecho cancelado." };
}

export async function setManualQuote(bookingId: string, segmentId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireArea("admin");
  const sale = parseMoney(text(formData, "sale"));
  const payout = parseMoney(text(formData, "payout"));
  const hours = Number(text(formData, "valid_hours") || "24");
  if (!UUID_RE.test(bookingId) || !UUID_RE.test(segmentId)) return { error: "Trecho inválido." };
  if (!Number.isFinite(sale) || sale <= 0) return withValues({ error: "Informe quanto a agência paga." }, formData);
  if (!Number.isFinite(payout) || payout < 0) return withValues({ error: "Informe quanto o prestador recebe." }, formData);
  if (payout > sale) return withValues({ error: "O repasse não pode ser maior que o valor da agência." }, formData);
  if (!Number.isInteger(hours) || hours < 1 || hours > 720) return withValues({ error: "Validade entre 1 e 720 horas." }, formData);
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_manual_quote", { p_segment: segmentId, p_sale_cents: sale, p_payout_cents: payout, p_valid_hours: hours });
  if (error) return withValues({ error: bookingError(error.message) }, formData);
  refresh("admin", bookingId);
  revalidatePath(`/agencia/reservas/${bookingId}`);
  return { success: "Cotação enviada." };
}

// ---------------------------------------------------------------------------
// Portal da agência: passageiros, locais e nova reserva
// ---------------------------------------------------------------------------
export async function createPassenger(_prev: FormState, formData: FormData): Promise<FormState> {
  const agency = await operatingAgency();
  if (!agency) return { error: "Você não tem permissão para cadastrar passageiros." };
  const fullName = text(formData, "full_name");
  const phone = text(formData, "phone") || null;
  const email = text(formData, "email").toLowerCase() || null;
  const notes = text(formData, "notes") || null;
  if (fullName.length < 3 || fullName.length > 200) return withValues({ error: "Informe o nome completo do passageiro." }, formData);
  if (phone && phone.length > 32) return withValues({ error: "Telefone muito longo." }, formData);
  if (email && (!email.includes("@") || email.length > 200)) return withValues({ error: "E-mail inválido." }, formData);
  if (notes && notes.length > 500) return withValues({ error: "Observação muito longa." }, formData);
  const supabase = await createClient();
  const { error } = await supabase.from("passengers").insert({ organization_id: agency.organization.id, full_name: fullName, phone, email, notes });
  if (error) return withValues({ error: bookingError(error.message) }, formData);
  revalidatePath("/agencia/passageiros");
  return { success: `${fullName} cadastrado.` };
}

function readLocation(formData: FormData) {
  const kind = text(formData, "kind") as LocationKind;
  const name = text(formData, "name");
  const code = text(formData, "code").toUpperCase() || null;
  const addressLine = text(formData, "address_line") || null;
  const city = text(formData, "city");
  const state = text(formData, "state").toUpperCase();
  if (!LOCATION_KINDS.includes(kind)) return { error: "Escolha o tipo do local." };
  if (name.length < 2 || name.length > 160) return { error: "Informe o nome do local." };
  if (code && (code.length < 2 || code.length > 8)) return { error: "Código entre 2 e 8 caracteres (ex.: CNF)." };
  if (addressLine && addressLine.length > 240) return { error: "Endereço muito longo." };
  if (city.length < 2 || city.length > 120) return { error: "Informe a cidade." };
  if (!/^[A-Z]{2}$/.test(state)) return { error: "Informe a UF com duas letras (ex.: MG)." };
  return { row: { kind, name, code, address_line: addressLine, city, state } };
}

/** Local da própria agência (hotel ou endereço que ela usa). */
export async function createAgencyLocation(_prev: FormState, formData: FormData): Promise<FormState> {
  const agency = await operatingAgency();
  if (!agency) return { error: "Você não tem permissão para cadastrar locais." };
  const parsed = readLocation(formData);
  if ("error" in parsed) return withValues({ error: parsed.error }, formData);
  const supabase = await createClient();
  const { error } = await supabase.from("locations").insert({ ...parsed.row, organization_id: agency.organization.id });
  if (error) return withValues({ error: bookingError(error.message) }, formData);
  revalidatePath("/agencia/locais");
  return { success: `${parsed.row.name} cadastrado.` };
}

/** Local da plataforma, visível a todas as agências. */
export async function createPlatformLocation(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireArea("admin");
  const parsed = readLocation(formData);
  if ("error" in parsed) return withValues({ error: parsed.error }, formData);
  const supabase = await createClient();
  const { error } = await supabase.from("locations").insert({ ...parsed.row, organization_id: null });
  if (error) return withValues({ error: bookingError(error.message) }, formData);
  revalidatePath("/admin/tarifas");
  return { success: `${parsed.row.name} cadastrado.` };
}

export async function setLocationActive(portal: Portal, locationId: string, active: boolean) {
  await requireArea(portal);
  if (!UUID_RE.test(locationId)) return;
  const supabase = await createClient();
  await supabase.from("locations").update({ is_active: active }).eq("id", locationId);
  revalidatePath(portal === "admin" ? "/admin/tarifas" : "/agencia/locais");
}

function optionalInt(formData: FormData, name: string, fallback: number | null) {
  const raw = text(formData, name);
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isInteger(n) ? n : NaN;
}

export async function createBooking(_prev: FormState, formData: FormData): Promise<FormState> {
  const agency = await operatingAgency();
  if (!agency) return { error: "Você não tem permissão para criar reservas." };
  const fail = (error: string) => withValues({ error }, formData);

  const passengerId = text(formData, "passenger_id");
  const categoryId = text(formData, "category_id");
  const pax = optionalInt(formData, "pax_count", NaN);
  const luggageLarge = optionalInt(formData, "luggage_large", 0);
  const luggageMedium = optionalInt(formData, "luggage_medium", 0);
  const childSeats = optionalInt(formData, "child_seats", 0);
  const notes = text(formData, "notes");
  const externalRef = text(formData, "external_ref");
  if (!UUID_RE.test(passengerId)) return fail("Escolha o passageiro.");
  if (!UUID_RE.test(categoryId)) return fail("Escolha a categoria do veículo.");
  if (!Number.isInteger(pax) || (pax as number) < 1 || (pax as number) > 80) return fail("Informe a quantidade de passageiros.");
  for (const n of [luggageLarge, luggageMedium]) if (!Number.isInteger(n) || (n as number) < 0 || (n as number) > 200) return fail("Quantidade de malas inválida.");
  if (!Number.isInteger(childSeats) || (childSeats as number) < 0 || (childSeats as number) > 10) return fail("Quantidade de cadeirinhas inválida.");
  if (notes.length > 500) return fail("Observação muito longa.");
  if (externalRef.length > 80) return fail("Referência interna muito longa.");

  const legs = formData.get("round_trip") === "on" ? ["1", "2"] : ["1"];
  const segments = [];
  for (const leg of legs) {
    const label = leg === "1" ? "Ida" : "Volta";
    const kind = text(formData, `kind_${leg}`) as ServiceKind;
    const origin = text(formData, `origin_${leg}`);
    const destination = text(formData, `destination_${leg}`);
    const pickupAt = localToIso(text(formData, `pickup_${leg}`));
    const tripReference = text(formData, `trip_reference_${leg}`);
    const kmRaw = text(formData, `distance_km_${leg}`).replace(",", ".");
    const km = kmRaw ? Number(kmRaw) : null;
    const minutes = optionalInt(formData, `duration_min_${leg}`, null);
    if (!SERVICE_KINDS.includes(kind)) return fail(`${label}: escolha o tipo de transfer.`);
    if (!UUID_RE.test(origin) || !UUID_RE.test(destination)) return fail(`${label}: escolha origem e destino.`);
    if (origin === destination) return fail(`${label}: origem e destino precisam ser diferentes.`);
    if (!pickupAt) return fail(`${label}: informe data e hora do embarque.`);
    if (tripReference.length > 40) return fail(`${label}: voo ou linha muito longo.`);
    if (km !== null && (!Number.isFinite(km) || km < 0.1 || km > 5000)) return fail(`${label}: distância inválida.`);
    if (minutes !== null && (!Number.isInteger(minutes) || minutes < 1 || minutes > 3000)) return fail(`${label}: duração inválida.`);
    segments.push({
      service_kind: kind,
      origin_location_id: origin,
      destination_location_id: destination,
      pickup_at: pickupAt,
      trip_reference: tripReference,
      pax_count: pax,
      luggage_large: luggageLarge,
      luggage_medium: luggageMedium,
      category_id: categoryId,
      needs_accessible: formData.get("needs_accessible") === "on",
      child_seats: childSeats,
      notes,
      distance_km: km,
      duration_min: minutes,
    });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_booking", {
    p_agency: agency.organization.id,
    p_passenger: passengerId,
    p_segments: segments,
    p_notes: null,
    p_external_ref: externalRef || null,
  });
  if (error || typeof data !== "string") return fail(bookingError(error?.message ?? ""));
  revalidatePath("/agencia/reservas");
  redirect(`/agencia/reservas/${data}`);
}
