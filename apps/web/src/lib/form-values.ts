/**
 * O React 19 limpa o formulário depois de cada Server Action.
 * Em caso de erro, devolvemos o que a pessoa digitou para ela não perder o trabalho.
 * Campos com vários valores (checkboxes de mesmo nome) vêm separados por vírgula.
 */
export type FormValues = Record<string, string>;

export function pickValues(formData: FormData): FormValues {
  const values: FormValues = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("$") || typeof value !== "string") continue;
    values[key] = key in values ? `${values[key]},${value}` : value;
  }
  return values;
}

/** Junta os valores digitados a um resultado de erro; sucesso volta limpo. */
export function withValues<T extends { error?: string }>(result: T, formData: FormData): T & { values?: FormValues } {
  return result.error ? { ...result, values: pickValues(formData) } : result;
}
