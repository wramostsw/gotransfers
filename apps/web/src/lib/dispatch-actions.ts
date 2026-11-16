"use server";

import { revalidatePath } from "next/cache";
import { requireArea, requireSession } from "@/lib/auth";
import type { FormState } from "@/lib/booking-actions";
import { UUID_RE } from "@/lib/bookings";
import { dispatchError } from "@/lib/dispatch";
import { withValues } from "@/lib/form-values";
import { createClient } from "@/lib/supabase/server";

// As permissões de verdade são conferidas dentro das funções do banco.

function text(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function refreshService(serviceId: string) {
  revalidatePath("/admin/servicos");
  revalidatePath(`/admin/servicos/${serviceId}`);
  revalidatePath("/transportadora/ofertas");
  revalidatePath("/transportadora/servicos");
}

// ---------------------------------------------------------------- operação GoTransfer
export async function dispatchService(serviceId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireArea("admin");
  const mode = text(formData, "mode");
  const minutes = Number(text(formData, "window_min"));
  const providers = formData.getAll("providers").map(String).filter((id) => UUID_RE.test(id));
  const fail = (error: string) => withValues({ error }, formData);
  if (!UUID_RE.test(serviceId)) return { error: "Serviço inválido." };
  if (!["simultaneous", "sequential", "directed"].includes(mode)) return fail("Escolha a modalidade.");
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 10080) return fail("Prazo para aceitar entre 1 minuto e 7 dias.");
  if (mode === "directed" && providers.length !== 1) return fail("Na oferta direcionada, marque exatamente um prestador.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("dispatch_service", {
    p_service: serviceId,
    p_mode: mode,
    p_providers: providers.length ? providers : null,
    p_window_sec: Math.round(minutes * 60),
  });
  if (error) return fail(dispatchError(error.message));
  refreshService(serviceId);
  return { success: `Oferta enviada a ${data} ${data === 1 ? "prestador" : "prestadores"}.` };
}

export async function stopDispatch(serviceId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireArea("admin");
  if (!UUID_RE.test(serviceId)) return { error: "Serviço inválido." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("stop_dispatch", { p_service: serviceId, p_reason: text(formData, "reason").slice(0, 300) });
  if (error) return withValues({ error: dispatchError(error.message) }, formData);
  refreshService(serviceId);
  return { success: "Distribuição interrompida." };
}

export async function assignManual(serviceId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireArea("admin");
  const provider = text(formData, "provider_id");
  const driver = text(formData, "driver_id");
  const vehicle = text(formData, "vehicle_id");
  const reason = text(formData, "reason");
  const fail = (error: string) => withValues({ error }, formData);
  if (!UUID_RE.test(serviceId)) return { error: "Serviço inválido." };
  if (!UUID_RE.test(provider) || !UUID_RE.test(driver) || !UUID_RE.test(vehicle)) return fail("Escolha prestador, motorista e veículo.");
  if (reason.length < 3) return fail("Informe a justificativa da atribuição manual.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_service_manual", {
    p_service: serviceId,
    p_provider: provider,
    p_driver: driver,
    p_vehicle: vehicle,
    p_reason: reason.slice(0, 250),
  });
  if (error) return fail(dispatchError(error.message));
  refreshService(serviceId);
  return { success: "Serviço atribuído." };
}

// ---------------------------------------------------------------- transportadora (e operação)
export async function respondOffer(offerId: string, accept: boolean, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireArea("transportadora");
  if (!UUID_RE.test(offerId)) return { error: "Oferta inválida." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_offer", { p_offer: offerId, p_accept: accept, p_reason: accept ? null : text(formData, "reason").slice(0, 300) || null });
  revalidatePath("/transportadora/ofertas");
  revalidatePath("/transportadora/servicos");
  if (error) return { error: dispatchError(error.message) };
  return { success: accept ? "Oferta aceita. Agora designe motorista e veículo em Serviços." : "Oferta recusada." };
}

export async function assignService(serviceId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireSession();
  const driver = text(formData, "driver_id");
  const vehicle = text(formData, "vehicle_id");
  const reason = text(formData, "reason");
  const fail = (error: string) => withValues({ error }, formData);
  if (!UUID_RE.test(serviceId)) return { error: "Serviço inválido." };
  if (!UUID_RE.test(driver) || !UUID_RE.test(vehicle)) return fail("Escolha o motorista e o veículo.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_service", { p_service: serviceId, p_driver: driver, p_vehicle: vehicle, p_reason: reason.slice(0, 250) || null });
  if (error) return fail(dispatchError(error.message));
  refreshService(serviceId);
  return { success: "Motorista e veículo designados." };
}

export async function releaseService(serviceId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireSession();
  const reason = text(formData, "reason");
  if (!UUID_RE.test(serviceId)) return { error: "Serviço inválido." };
  if (reason.length < 3) return withValues({ error: "Informe o motivo." }, formData);
  const supabase = await createClient();
  const { error } = await supabase.rpc("release_service", { p_service: serviceId, p_reason: reason.slice(0, 250) });
  if (error) return withValues({ error: dispatchError(error.message) }, formData);
  refreshService(serviceId);
  return { success: "Serviço devolvido à central GoTransfer." };
}

// ---------------------------------------------------------------- motorista
const DRIVER_STEPS = ["driver_en_route", "driver_arrived", "boarding", "in_progress", "completed"];

/** O motorista avança uma etapa. Devolve a mensagem de erro, ou null se deu certo. */
export async function driverAdvance(serviceId: string, to: string): Promise<string | null> {
  await requireSession();
  if (!UUID_RE.test(serviceId) || !DRIVER_STEPS.includes(to)) return "Etapa inválida.";
  const supabase = await createClient();
  const { error } = await supabase.rpc("driver_advance_service", { p_service: serviceId, p_to: to });
  if (error) return dispatchError(error.message);
  revalidatePath("/motorista", "layout");
  return null;
}
