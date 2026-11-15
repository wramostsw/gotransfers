/** Lê filtros da URL de forma segura (searchParams chegam como string | string[] | undefined). */
export type RawParams = Record<string, string | string[] | undefined>;

export function param(params: RawParams, key: string): string {
  const v = params[key];
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

export function oneOf<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export function pageNumber(params: RawParams) {
  const n = Number(param(params, "pagina"));
  return Number.isInteger(n) && n > 0 ? n : 1;
}

/** Monta um link mantendo os filtros atuais e trocando os informados (valor vazio remove). */
export function hrefWith(base: string, current: Record<string, string>, changes: Record<string, string | number | null>) {
  const merged: Record<string, string> = { ...current };
  for (const [k, v] of Object.entries(changes)) {
    if (v === null || v === "") delete merged[k];
    else merged[k] = String(v);
  }
  const qs = new URLSearchParams(merged).toString();
  return qs ? `${base}?${qs}` : base;
}

/** Escapa curingas para usar em filtros ILIKE do PostgREST. */
export function likePattern(text: string) {
  return `%${text.replace(/[\\%_,()]/g, " ").trim()}%`;
}
