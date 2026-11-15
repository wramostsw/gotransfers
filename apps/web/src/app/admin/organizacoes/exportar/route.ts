import { NextResponse, type NextRequest } from "next/server";
import { getSessionContext } from "@/lib/auth";
import { formatTaxId, orgQuery, orgTypeLabel, readOrgFilters, type OrgRow } from "@/lib/orgs";
import { ORG_STATUS_LABEL } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

function csvCell(value: string) {
  // Evita que planilhas executem fórmulas vindas dos dados.
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Exporta a lista de organizações com os mesmos filtros da tela. Só equipe GoTransfer. */
export async function GET(request: NextRequest) {
  const session = await getSessionContext();
  if (!session || !session.memberships.some((m) => m.organization.type === "platform")) {
    return new NextResponse("Acesso negado", { status: 403 });
  }
  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const supabase = await createClient();
  const { data, error } = await orgQuery(supabase, readOrgFilters(params), false).limit(5000).returns<OrgRow[]>();
  if (error) return new NextResponse("Não foi possível exportar", { status: 500 });

  const header = ["Nome fantasia", "Razão social", "Documento", "Tipo", "Status", "Criada em"];
  const lines = (data ?? []).map((o) =>
    [o.trade_name, o.legal_name, formatTaxId(o.tax_id), orgTypeLabel(o), ORG_STATUS_LABEL[o.status], new Date(o.created_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })]
      .map(csvCell)
      .join(";"),
  );
  const body = "﻿" + [header.map(csvCell).join(";"), ...lines].join("\r\n");
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="organizacoes-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
