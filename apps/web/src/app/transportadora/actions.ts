"use server";

import { revalidatePath } from "next/cache";
import { INACTIVE_ORG_MESSAGE, orgIsActive, requireOrgRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { LANGUAGES, LICENSE_CATEGORIES, PLATE_RE, type DriverStatus, type VehicleStatus } from "@/lib/fleet";
import { withValues, type FormValues } from "@/lib/form-values";
import type { MemberRole } from "@/lib/roles";

export type FormState = { error?: string; success?: string; values?: FormValues };

const MANAGERS: MemberRole[] = ["carrier_admin", "carrier_dispatcher"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VEHICLE_STATUSES: VehicleStatus[] = ["available", "unavailable", "maintenance"];
const DRIVER_STATUSES: DriverStatus[] = ["active", "inactive"];

function dbError(message: string): string {
  if (message.includes("vehicles_plate_unique")) return "Já existe um veículo cadastrado com esta placa.";
  if (message.includes("drivers_license_unique")) return "Já existe um motorista com este número de CNH.";
  if (message.includes("drivers_user_unique")) return "Esta conta já está ligada a outro motorista desta transportadora.";
  if (message.includes("USER_NOT_FOUND")) return "O motorista ainda não criou a conta com este e-mail. Peça para ele se cadastrar no app primeiro.";
  if (message.includes("EMAIL_REQUIRED")) return "Cadastre o e-mail do motorista antes de liberar o app.";
  if (message.includes("NOT_ALLOWED") || message.includes("row-level security")) return "Você não tem permissão para esta ação.";
  return "Não foi possível concluir. Tente de novo.";
}

function int(formData: FormData, name: string) {
  const value = Number(String(formData.get(name) ?? "").trim());
  return Number.isInteger(value) ? value : NaN;
}

export async function createVehicle(_prev: FormState, formData: FormData): Promise<FormState> {
  return withValues(await saveVehicle(formData), formData);
}

async function saveVehicle(formData: FormData): Promise<FormState> {
  const { membership } = await requireOrgRole("transportadora", MANAGERS);
  if (!orgIsActive(membership)) return { error: INACTIVE_ORG_MESSAGE };
  const categoryId = String(formData.get("category_id") ?? "");
  const brand = String(formData.get("brand") ?? "").trim();
  const model = String(formData.get("model") ?? "").trim();
  const plate = String(formData.get("plate") ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const color = String(formData.get("color") ?? "").trim() || null;
  const modelYear = int(formData, "model_year");
  const seats = int(formData, "seats");
  const luggageLarge = int(formData, "luggage_large");
  const luggageMedium = int(formData, "luggage_medium");
  const maxYear = new Date().getFullYear() + 1;

  if (!UUID_RE.test(categoryId)) return { error: "Escolha a categoria do veículo." };
  if (brand.length < 2 || model.length < 1) return { error: "Informe marca e modelo." };
  if (!PLATE_RE.test(plate)) return { error: "Placa inválida. Use o formato ABC1D23 ou ABC1234." };
  if (!(modelYear >= 1980 && modelYear <= maxYear)) return { error: "Ano do veículo inválido." };
  if (!(seats >= 1 && seats <= 80)) return { error: "Informe quantos passageiros o veículo leva (1 a 80)." };
  if (!(luggageLarge >= 0 && luggageLarge <= 200) || !(luggageMedium >= 0 && luggageMedium <= 200)) {
    return { error: "Informe a capacidade de malas (0 ou mais)." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("vehicles").insert({
    organization_id: membership.organization.id,
    category_id: categoryId,
    brand,
    model,
    model_year: modelYear,
    plate,
    color,
    seats,
    luggage_large: luggageLarge,
    luggage_medium: luggageMedium,
    is_accessible: formData.get("is_accessible") === "on",
    has_child_seat: formData.get("has_child_seat") === "on",
  });
  if (error) return { error: dbError(error.message) };

  revalidatePath("/transportadora/veiculos");
  return { success: `${brand} ${model} cadastrado. Ele fica em análise até a GoTransfer aprovar.` };
}

export async function setVehicleStatus(vehicleId: string, status: VehicleStatus) {
  const { membership } = await requireOrgRole("transportadora", MANAGERS);
  if (!orgIsActive(membership)) return;
  if (!UUID_RE.test(vehicleId) || !VEHICLE_STATUSES.includes(status)) return;
  const supabase = await createClient();
  await supabase.from("vehicles").update({ status }).eq("id", vehicleId);
  revalidatePath("/transportadora/veiculos");
}

export async function createDriver(_prev: FormState, formData: FormData): Promise<FormState> {
  return withValues(await saveDriver(formData), formData);
}

async function saveDriver(formData: FormData): Promise<FormState> {
  const { membership } = await requireOrgRole("transportadora", MANAGERS);
  if (!orgIsActive(membership)) return { error: INACTIVE_ORG_MESSAGE };
  const fullName = String(formData.get("full_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const email = String(formData.get("email") ?? "").trim().toLowerCase() || null;
  const licenseNumber = String(formData.get("license_number") ?? "").replace(/\D/g, "");
  const licenseCategory = String(formData.get("license_category") ?? "");
  const licenseExpiresAt = String(formData.get("license_expires_at") ?? "");
  const allowed = new Set(LANGUAGES.map((l) => l.code));
  const languages = formData.getAll("languages").map(String).filter((code) => allowed.has(code));

  if (fullName.length < 3) return { error: "Informe o nome completo do motorista." };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "E-mail inválido." };
  if (licenseNumber.length < 5 || licenseNumber.length > 20) return { error: "Número da CNH inválido." };
  if (!(LICENSE_CATEGORIES as readonly string[]).includes(licenseCategory)) return { error: "Escolha a categoria da CNH." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(licenseExpiresAt)) return { error: "Informe a validade da CNH." };

  const supabase = await createClient();
  const { error } = await supabase.from("drivers").insert({
    organization_id: membership.organization.id,
    full_name: fullName,
    phone,
    email,
    license_number: licenseNumber,
    license_category: licenseCategory,
    license_expires_at: licenseExpiresAt,
    languages: languages.length ? languages : ["pt"],
  });
  if (error) return { error: dbError(error.message) };

  revalidatePath("/transportadora/motoristas");
  return { success: `${fullName} cadastrado. O cadastro fica em análise até a GoTransfer aprovar.` };
}

export async function setDriverStatus(driverId: string, status: DriverStatus) {
  const { membership } = await requireOrgRole("transportadora", MANAGERS);
  if (!orgIsActive(membership)) return;
  if (!UUID_RE.test(driverId) || !DRIVER_STATUSES.includes(status)) return;
  const supabase = await createClient();
  await supabase.from("drivers").update({ status }).eq("id", driverId);
  revalidatePath("/transportadora/motoristas");
}

export async function linkDriverUser(driverId: string, _prev: FormState): Promise<FormState> {
  const { membership } = await requireOrgRole("transportadora", ["carrier_admin"]);
  if (!orgIsActive(membership)) return { error: INACTIVE_ORG_MESSAGE };
  if (!UUID_RE.test(driverId)) return { error: "Motorista inválido." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("link_driver_user", { p_driver: driverId });
  if (error) return { error: dbError(error.message) };
  revalidatePath("/transportadora/motoristas");
  return { success: "Acesso ao app liberado." };
}
