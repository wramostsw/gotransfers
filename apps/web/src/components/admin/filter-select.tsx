"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Filtro de lista que atualiza a URL ao mudar (volta para a página 1). */
export function FilterSelect({
  name,
  label,
  options,
}: {
  name: string;
  label: string;
  options: Array<{ value: string; label: string }>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const value = params.get(name) ?? "";
  return (
    <label className="flex h-[38px] items-center gap-2 rounded-[10px] border border-[#DCE2EE] bg-surface pl-3 text-[13px] font-semibold text-muted">
      {label}
      <select
        value={value}
        onChange={(e) => {
          const next = new URLSearchParams(params.toString());
          if (e.target.value) next.set(name, e.target.value);
          else next.delete(name);
          next.delete("pagina");
          const qs = next.toString();
          router.push(qs ? `${pathname}?${qs}` : pathname);
        }}
        className="h-full rounded-r-[10px] bg-transparent pr-2 text-[13px] font-semibold text-ink outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
