"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export type AuthFormState = { error?: string; success?: string; email?: string; fullName?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NOT_CONFIGURED = "O app ainda não está ligado ao banco de dados. Falta a chave pública do Supabase.";

function translate(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (m.includes("email not confirmed")) return "Confirme seu e-mail pelo link que enviamos antes de entrar.";
  if (m.includes("already registered") || m.includes("already been registered")) return "Já existe uma conta com este e-mail.";
  if (m.includes("rate limit") || m.includes("too many")) return "Muitas tentativas. Aguarde um pouco e tente de novo.";
  if (m.includes("password")) return "A senha não atende aos requisitos de segurança. Use pelo menos 8 caracteres.";
  return "Não foi possível concluir. Tente de novo em instantes.";
}

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!isSupabaseConfigured) return { error: NOT_CONFIGURED, email };
  if (!EMAIL_RE.test(email) || !password) return { error: "Informe e-mail e senha.", email };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: translate(error.message), email };
  redirect("/inicio");
}

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const fullName = String(formData.get("full_name") ?? "").trim().slice(0, 200);
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const keep = { email, fullName };
  if (!isSupabaseConfigured) return { error: NOT_CONFIGURED, ...keep };
  if (fullName.length < 3) return { error: "Informe seu nome completo.", ...keep };
  if (!EMAIL_RE.test(email)) return { error: "Informe um e-mail válido.", ...keep };
  if (password.length < 8) return { error: "A senha precisa ter pelo menos 8 caracteres.", ...keep };

  const headerList = await headers();
  const origin = headerList.get("origin") ?? `https://${headerList.get("host")}`;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName }, emailRedirectTo: `${origin}/auth/callback` },
  });
  if (error) return { error: translate(error.message), ...keep };
  if (data.session) redirect("/inicio");
  return { success: "Enviamos um link de confirmação para o seu e-mail. Abra o link para ativar a conta." };
}

export async function signOut() {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/entrar");
}
