import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { supabaseKey, supabaseUrl } from "./env";

/**
 * Cliente Supabase para Server Components, Server Actions e Route Handlers.
 * Dados de sessão só existem numa requisição real: `connection()` tira esta leitura
 * do pré-render (o cliente consulta o relógio para validar o token).
 * Quem chama precisa estar dentro de um <Suspense>.
 */
export async function createClient() {
  await connection();
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Chamado de um Server Component: a sessão é renovada pelo proxy.
        }
      },
    },
  });
}
