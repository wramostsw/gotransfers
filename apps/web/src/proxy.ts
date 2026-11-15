import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured, supabaseKey, supabaseUrl } from "@/lib/supabase/env";

const PROTECTED = ["/inicio", "/admin", "/agencia", "/transportadora", "/motorista"];
const AUTH_PAGES = ["/entrar", "/cadastro"];

// Renova a sessão do Supabase e faz o redirecionamento otimista.
// A autorização de verdade acontece no servidor (lib/auth.ts) e no banco (RLS).
export async function proxy(request: NextRequest) {
  if (!isSupabaseConfigured) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const redirectTo = (path: string) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = "";
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  };

  if (!user && PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return redirectTo("/entrar");
  }
  if (user && (pathname === "/" || AUTH_PAGES.includes(pathname))) {
    return redirectTo("/inicio");
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icons/|sw.js|offline.html|manifest.webmanifest|.*\\.(?:png|jpg|svg|webp|ico)$).*)"],
};
