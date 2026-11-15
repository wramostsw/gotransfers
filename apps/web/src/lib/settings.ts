/** Parâmetros da plataforma (tabela platform_settings). Validação compartilhada por tela e servidor. */

export const TIMEZONES = [
  "America/Sao_Paulo",
  "America/Fortaleza",
  "America/Recife",
  "America/Belem",
  "America/Manaus",
  "America/Cuiaba",
  "America/Porto_Velho",
  "America/Rio_Branco",
  "America/Noronha",
] as const;

type NumberSetting = { kind: "number"; label: string; unit: string; hint: string; min: number; max: number; group: "operacao" | "seguranca" };
type BoolSetting = { kind: "boolean"; label: string; hint: string; group: "seguranca" };
type ChoiceSetting = { kind: "choice"; label: string; hint: string; options: readonly string[]; group: "operacao" };
export type SettingDef = NumberSetting | BoolSetting | ChoiceSetting;

export const SETTINGS: Record<string, SettingDef> = {
  wait_tolerance_airport_min: { kind: "number", label: "Tolerância de espera · aeroporto", unit: "min", hint: "Contada a partir do pouso real do voo", min: 0, max: 240, group: "operacao" },
  wait_tolerance_bus_station_min: { kind: "number", label: "Tolerância de espera · rodoviária", unit: "min", hint: "Contada a partir da chegada do ônibus", min: 0, max: 240, group: "operacao" },
  min_booking_lead_hours: { kind: "number", label: "Antecedência mínima para reservar", unit: "horas", hint: "Pedidos com menos tempo vão para a central", min: 0, max: 72, group: "operacao" },
  offer_accept_window_sec: { kind: "number", label: "Prazo para aceitar uma oferta", unit: "segundos", hint: "Depois disso a oferta vai ao próximo prestador", min: 15, max: 600, group: "operacao" },
  document_expiry_warning_days: { kind: "number", label: "Aviso de documento a vencer", unit: "dias", hint: "Antecedência dos alertas de vencimento", min: 1, max: 120, group: "operacao" },
  default_timezone: { kind: "choice", label: "Fuso horário padrão", hint: "Horários são guardados em UTC e exibidos neste fuso", options: TIMEZONES, group: "operacao" },
  session_max_hours: { kind: "number", label: "Duração máxima da sessão", unit: "horas", hint: "Será aplicado quando o controle de sessão for ativado", min: 1, max: 168, group: "seguranca" },
  require_mfa_for_admins: { kind: "boolean", label: "Verificação em duas etapas obrigatória para administradores", hint: "Será aplicada quando a verificação em duas etapas for ativada no login", group: "seguranca" },
  audit_personal_data_exports: { kind: "boolean", label: "Registrar exportação de dados pessoais", hint: "Exportações com dados de passageiros ficam na auditoria", group: "seguranca" },
};

export type SettingsValues = Record<string, number | boolean | string>;

/** Valida o formulário e devolve só os valores aceitos, ou a mensagem de erro. */
export function parseSettings(formData: FormData): { values: SettingsValues } | { error: string } {
  const values: SettingsValues = {};
  for (const [key, def] of Object.entries(SETTINGS)) {
    const raw = formData.get(key);
    if (def.kind === "boolean") {
      values[key] = raw === "on";
      continue;
    }
    const text = String(raw ?? "").trim();
    if (def.kind === "choice") {
      if (!def.options.includes(text)) return { error: `${def.label}: escolha uma opção da lista.` };
      values[key] = text;
      continue;
    }
    const n = Number(text);
    if (!Number.isInteger(n) || n < def.min || n > def.max) return { error: `${def.label}: use um número inteiro entre ${def.min} e ${def.max}.` };
    values[key] = n;
  }
  return { values };
}
