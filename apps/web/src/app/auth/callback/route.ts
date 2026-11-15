import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

// Destino do link de confirmação de e-mail: troca o código por uma sessão.
export async function GET(request: NextRequest) {
  const url = request.nextUrl.clone();
  const code = url.searchParams.get("code");
  url.search = "";

  if (isSupabaseConfigured && code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      url.pathname = "/inicio";
      return NextResponse.redirect(url);
    }
  }
  url.pathname = "/entrar";
  return NextResponse.redirect(url);
}
