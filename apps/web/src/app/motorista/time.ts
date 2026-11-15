/** "em 1h10", "em 25 min", "hoje" ou "amanhã" para um horário HH:MM a partir de hoje. */
export function relativeStart(dayOffset: number, time: string, now: Date) {
  if (dayOffset >= 1) return dayOffset === 1 ? "amanhã" : `em ${dayOffset} dias`;
  const [h, m] = time.split(":").map(Number);
  const start = new Date(now);
  start.setHours(h, m, 0, 0);
  const minutes = Math.round((start.getTime() - now.getTime()) / 60000);
  // Horário já passou (dados fictícios com horário fixo): não dizer "agora", que seria falso.
  if (minutes <= 0) return "hoje";
  if (minutes < 60) return `em ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `em ${hours}h${String(rest).padStart(2, "0")}` : `em ${hours}h`;
}

/** Soma minutos a um horário HH:MM. */
export function addMinutes(time: string, minutes: number) {
  const [h, m] = time.split(":").map(Number);
  const total = (h * 60 + m + minutes + 24 * 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function compareService(a: { dayOffset: number; time: string }, b: { dayOffset: number; time: string }) {
  return a.dayOffset - b.dayOffset || a.time.localeCompare(b.time);
}
