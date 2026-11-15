// Configuração pública do Supabase. A chave publishable/anon pode ir ao navegador;
// a proteção dos dados é feita pelas políticas RLS no banco.
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

export const isSupabaseConfigured = supabaseUrl.startsWith("https://") && supabaseKey.length > 20;
