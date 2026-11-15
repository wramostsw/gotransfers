import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
const dir = process.argv[2];
const db = new PGlite();
await db.exec(`
create role anon nologin; create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}', created_at timestamptz default now(), last_sign_in_at timestamptz, email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;
grant usage on schema public to authenticated, anon;
`);
for (const f of readdirSync(dir).sort()) {
  await db.exec(readFileSync(`${dir}/${f}`, "utf8"));
  console.log("migracao ok:", f);
}

let pass = 0;
let fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) pass++;
  else fail++;
  console.log(`${cond ? "PASS" : "FAIL"} ${name} ${cond ? "" : extra}`);
};
const q = async (sql, p) => (await db.query(sql, p)).rows;
const as = async (uid, fn) => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ""}', false); ${uid === null ? "" : "set role authenticated;"}`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false);");
  }
};
const fails = async (name, uid, sql, p, expect) => {
  try {
    await as(uid, () => q(sql, p));
    ok(name, false, "nao falhou");
  } catch (e) {
    ok(name, String(e.message).includes(expect), `erro: ${e.message}`);
  }
};

// Cenario
const user = async (email) => (await q("insert into auth.users (email) values ($1) returning id", [email]))[0].id;
const admin = await user("admin@x");
const agentA = await user("agenta@x");
const adminA = await user("admina@x");
const agentB = await user("agentb@x");
const carrier = await user("carrier@x");
const org = async (type, name, status = "active") =>
  (await q("insert into public.organizations (type, legal_name, trade_name, status) values ($1,$2,$2,$3) returning id", [type, name, status]))[0].id;
const platform = (await q("select id from public.organizations where type='platform'"))[0].id;
const agA = await org("agency", "Agencia A");
const agB = await org("agency", "Agencia B");
const car = await org("transport_company", "Transp C");
const mem = (u, o, r) => q("insert into public.memberships (user_id, organization_id, role) values ($1,$2,$3)", [u, o, r]);
await mem(admin, platform, "superadmin");
await mem(agentA, agA, "agency_agent");
await mem(adminA, agA, "agency_admin");
await mem(agentB, agB, "agency_agent");
await mem(carrier, car, "carrier_admin");
const sedan = (await q("select id from public.vehicle_categories where slug='sedan'"))[0].id;
const van = (await q("select id from public.vehicle_categories where slug='van'"))[0].id;

const loc = (uid, o, kind, name) =>
  as(uid, async () => (await q("insert into public.locations (organization_id, kind, name, city, state) values ($1,$2,$3,'Cidade','MG') returning id", [o, kind, name]))[0].id);
const airport = await loc(admin, null, "airport", "Aeroporto");
const hotel = await loc(admin, null, "hotel", "Hotel");
const houseA = await loc(agentA, agA, "address", "Casa cliente A");
await fails("agente nao cria local da plataforma", agentA, "insert into public.locations (organization_id, kind, name, city, state) values (null,'hotel','X1','Cidade','MG')", [], "row-level security");
await fails("agente B nao cria local da agencia A", agentB, "insert into public.locations (organization_id, kind, name, city, state) values ($1,'hotel','X2','Cidade','MG')", [agA], "row-level security");
ok("agente B nao ve local privado da A", (await as(agentB, () => q("select id from public.locations where id=$1", [houseA]))).length === 0);

const pax = await as(agentA, async () => (await q("insert into public.passengers (organization_id, full_name) values ($1,'Maria Teste') returning id", [agA]))[0].id);
ok("agente B nao ve passageiro da A", (await as(agentB, () => q("select id from public.passengers"))).length === 0);

await as(admin, () =>
  q("insert into public.pricing_rules (name, mode, origin_location_id, destination_location_id, category_id, sale_price_cents, take_bps) values ('Aeroporto-Hotel sedan','fixed',$1,$2,$3,20000,2400)", [airport, hotel, sedan]),
);
await as(admin, () =>
  q("insert into public.pricing_rules (name, mode, category_id, base_cents, per_km_cents, per_min_cents, min_price_cents, take_bps) values ('Por km van','distance',$1,1000,350,50,9000,2000)", [van]),
);
await fails("agente nao cria regra de preco", agentA, "insert into public.pricing_rules (name, mode, sale_price_cents, take_bps) values ('hack','fixed',100,0)", [], "row-level security");
ok("agente nao le regras de preco", (await as(agentA, () => q("select id from public.pricing_rules"))).length === 0);
await as(admin, () => q("update public.pricing_rules set priority = 1 where name='Por km van'"));
ok("editar regra aumenta a versao", (await q("select version from public.pricing_rules where name='Por km van'"))[0].version === 2);

const at = (h) => new Date(Date.now() + h * 3600e3).toISOString();
const seg = (o, d, extra = {}) => ({ service_kind: "airport_arrival", origin_location_id: o, destination_location_id: d, pickup_at: at(48), pax_count: 2, category_id: sedan, ...extra });
const CREATE = "select public.create_booking($1,$2,$3::jsonb) as id";
const create = (uid, agency, passenger, segs) => as(uid, async () => (await q(CREATE, [agency, passenger, JSON.stringify(segs)]))[0].id);

await fails("gravacao direta em reservas e negada", agentA, "insert into public.bookings (code, agency_id, passenger_id, status) values ('X',$1,$2,'confirmed')", [agA, pax], "permission denied");
await fails("agente B nao reserva pela agencia A", agentB, CREATE, [agA, pax, JSON.stringify([seg(airport, hotel)])], "NOT_ALLOWED");
await fails("transportadora nao reserva", carrier, CREATE, [agA, pax, JSON.stringify([seg(airport, hotel)])], "NOT_ALLOWED");
await fails("antecedencia minima", agentA, CREATE, [agA, pax, JSON.stringify([seg(airport, hotel, { pickup_at: at(1) })])], "PICKUP_TOO_SOON");
await fails("passageiro de outra agencia e recusado", agentB, CREATE, [agB, pax, JSON.stringify([seg(airport, hotel)])], "PASSENGER_NOT_FOUND");

const preview = await as(agentA, async () => (await q("select public.preview_price($1,'airport_departure',$2,$3,$4,$5) as p", [agA, hotel, airport, sedan, at(48)]))[0].p);
ok("previa (volta, regra bidirecional) so mostra o valor da agencia", preview.mode === "fixed" && preview.sale_price_cents === 20000 && Object.keys(preview).length === 3, JSON.stringify(preview));
await fails("agencia B nao consulta preco da A", agentB, "select public.preview_price($1,'airport_departure',$2,$3,$4,$5)", [agA, hotel, airport, sedan, at(48)], "NOT_ALLOWED");

// Reserva: ida (tabela) + trecho sem regra (cotacao manual)
const b1 = await create(agentA, agA, pax, [seg(airport, hotel), seg(hotel, houseA, { service_kind: "point_to_point", pickup_at: at(72) })]);
let b = (await q("select * from public.bookings where id=$1", [b1]))[0];
ok("reserva nasce aguardando cotacao com total parcial", b.status === "awaiting_quote" && b.total_cents === 20000 && /^GT-\d{6}$/.test(b.code), JSON.stringify(b));
const segs = await q("select * from public.booking_segments where booking_id=$1 order by position", [b1]);
ok("trecho 1 tabelado, trecho 2 em cotacao manual", segs[0].status === "quoted" && segs[0].pricing_mode === "fixed" && segs[1].status === "awaiting_quote" && segs[1].sale_price_cents === null);
ok("trecho guarda copia do local", segs[0].origin_snapshot.name === "Aeroporto");
await fails("nao confirma com cotacao pendente", agentA, "select public.confirm_booking($1)", [b1], "INVALID_STATE");
await fails("agencia nao define cotacao manual", agentA, "select public.set_manual_quote($1,100,0)", [segs[1].id], "NOT_ALLOWED");
await fails("repasse maior que a venda e recusado", admin, "select public.set_manual_quote($1,100,200)", [segs[1].id], "INVALID_QUOTE");
await as(admin, () => q("select public.set_manual_quote($1,12800,9728)", [segs[1].id]));
b = (await q("select * from public.bookings where id=$1", [b1]))[0];
ok("apos cotacao manual a reserva fica cotada", b.status === "quoted" && b.total_cents === 32800, JSON.stringify(b));

ok("agencia nao ve composicao do preco", (await as(adminA, () => q("select * from public.segment_costs"))).length === 0);
ok("plataforma ve composicao (24%)", (await as(admin, () => q("select * from public.segment_costs where segment_id=$1", [segs[0].id])))[0].platform_fee_cents === 4800);
ok("agencia B nao ve reserva da A", (await as(agentB, () => q("select id from public.bookings"))).length === 0);
ok(
  "transportadora nao ve reservas nem trechos",
  (await as(carrier, () => q("select id from public.bookings"))).length === 0 && (await as(carrier, () => q("select id from public.booking_segments"))).length === 0,
);
await fails("agencia B nao confirma reserva da A", agentB, "select public.confirm_booking($1)", [b1], "NOT_ALLOWED");

await as(agentA, () => q("select public.confirm_booking($1)", [b1]));
b = (await q("select * from public.bookings where id=$1", [b1]))[0];
const svcs = await q("select * from public.services where booking_id=$1", [b1]);
let led = await q("select * from public.ledger_entries where booking_id=$1", [b1]);
ok("confirmada, 2 servicos aguardando distribuicao", b.status === "confirmed" && svcs.length === 2 && svcs.every((s) => s.status === "awaiting_dispatch"));
ok("eventos de servico registrados pela agencia", (await q("select origin from public.service_events")).every((e) => e.origin === "agency"));
const sum = (rows, acc, dir) => rows.filter((r) => r.account === acc && r.direction === dir).reduce((a, r) => a + Number(r.amount_cents), 0);
ok(
  "livro-razao: 6 lancamentos (32800 = 7872 taxa + 24928 repasse)",
  led.length === 6 && sum(led, "agency_receivable", "debit") === 32800 && sum(led, "platform_revenue", "credit") === 7872 && sum(led, "provider_accrual", "credit") === 24928,
  JSON.stringify(led.map((l) => [l.account, l.direction, l.amount_cents])),
);
await fails("nao confirma duas vezes", agentA, "select public.confirm_booking($1)", [b1], "INVALID_STATE");
ok("agente (sem papel financeiro) nao ve o livro-razao", (await as(agentA, () => q("select id from public.ledger_entries"))).length === 0);
const ledA = await as(adminA, () => q("select account from public.ledger_entries"));
ok("admin da agencia ve so o que deve", ledA.length === 2 && ledA.every((l) => l.account === "agency_receivable"));
ok(
  "agencia B e transportadora nao veem lancamentos",
  (await as(agentB, () => q("select id from public.ledger_entries"))).length === 0 && (await as(carrier, () => q("select id from public.ledger_entries"))).length === 0,
);
await fails("lancamento nao pode ser editado", null, "update public.ledger_entries set amount_cents = 1", [], "LEDGER_IMMUTABLE");
await fails("lancamento nao pode ser apagado", null, "delete from public.ledger_entries", [], "LEDGER_IMMUTABLE");
await fails("lancamento desbalanceado e recusado", null, "insert into public.ledger_entries (tx_id, entry_type, account, direction, amount_cents) values (gen_random_uuid(),'adjustment','platform_revenue','credit',500)", [], "LEDGER_UNBALANCED");
await fails("cotacao manual apos confirmar e recusada", admin, "select public.set_manual_quote($1,100,50)", [segs[1].id], "INVALID_STATE");
const audA = await as(adminA, () => q("select entity from public.audit_logs"));
ok(
  "auditoria da agencia nao traz regras nem custos",
  audA.length > 0 && !audA.some((a) => ["pricing_rules", "segment_costs"].includes(a.entity)) && audA.some((a) => a.entity === "bookings"),
  JSON.stringify([...new Set(audA.map((a) => a.entity))]),
);

// Cancelamento parcial e total
await fails("cancelar exige motivo", agentA, "select public.cancel_segment($1,' ')", [segs[1].id], "REASON_REQUIRED");
await as(agentA, () => q("select public.cancel_segment($1,'Cliente desistiu da volta')", [segs[1].id]));
b = (await q("select * from public.bookings where id=$1", [b1]))[0];
ok("cancelar um trecho mantem a reserva confirmada com novo total", b.status === "confirmed" && b.total_cents === 20000, JSON.stringify(b));
ok(
  "servico do trecho cancelado; o outro segue",
  (await q("select status from public.services where booking_id=$1 order by pickup_at", [b1])).map((s) => s.status).join() === "awaiting_dispatch,cancelled",
);
await as(agentA, () => q("select public.cancel_booking($1,'Viagem cancelada')", [b1]));
b = (await q("select * from public.bookings where id=$1", [b1]))[0];
led = await q("select * from public.ledger_entries where booking_id=$1", [b1]);
const net = (acc) => sum(led, acc, "debit") - sum(led, acc, "credit");
ok(
  "reserva cancelada com estorno integral (saldo zero em todas as contas)",
  b.status === "cancelled" && b.total_cents === 0 && b.cancel_reason === "Viagem cancelada" && led.length === 12 && net("agency_receivable") === 0 && net("platform_revenue") === 0 && net("provider_accrual") === 0,
  JSON.stringify({ s: b.status, t: b.total_cents, r: b.cancel_reason, n: led.length }),
);
ok("nada foi apagado", (await q("select count(*)::int c from public.booking_segments where booking_id=$1", [b1]))[0].c === 2);
await fails("nao cancela duas vezes", agentA, "select public.cancel_booking($1,'de novo')", [b1], "INVALID_STATE");

// Distancia e tempo: 1000 + 350*23.4 (8190) + 50*40 (2000) = 11190; taxa 20% = 2238
const b2 = await create(agentA, agA, pax, [seg(hotel, houseA, { service_kind: "point_to_point", category_id: van, distance_km: 23.4, duration_min: 40 })]);
const s2 = (await q("select * from public.booking_segments where booking_id=$1", [b2]))[0];
const c2 = (await q("select * from public.segment_costs where segment_id=$1", [s2.id]))[0];
ok(
  "preco por distancia e tempo",
  s2.pricing_mode === "distance" && s2.sale_price_cents === 11190 && c2.platform_fee_cents === 2238 && c2.provider_payout_cents === 8952 && c2.rule_version === 2,
  JSON.stringify([s2.sale_price_cents, c2]),
);
const b3 = await create(agentA, agA, pax, [seg(hotel, houseA, { service_kind: "point_to_point", category_id: van, distance_km: 2, duration_min: 5 })]);
ok("preco minimo aplicado", (await q("select total_cents t from public.bookings where id=$1", [b3]))[0].t === 9000);

// Cotacao vencida
await q("update public.booking_segments set quote_valid_until = now() - interval '1 hour' where booking_id=$1", [b2]);
await fails("cotacao vencida nao confirma", agentA, "select public.confirm_booking($1)", [b2], "QUOTE_EXPIRED");
await as(agentA, () => q("select public.refresh_quote($1)", [b2]));
await as(agentA, () => q("select public.confirm_booking($1)", [b2]));
ok("apos recalcular, confirma", (await q("select status from public.bookings where id=$1", [b2]))[0].status === "confirmed");

// Preco contratado da agencia vence a tabela geral
await as(admin, () =>
  q("insert into public.pricing_rules (name, mode, agency_id, origin_location_id, destination_location_id, sale_price_cents, take_bps) values ('Contrato B','fixed',$1,$2,$3,18000,2000)", [agB, airport, hotel]),
);
const paxB = await as(agentB, async () => (await q("insert into public.passengers (organization_id, full_name) values ($1,'Joao B') returning id", [agB]))[0].id);
const b4 = await create(agentB, agB, paxB, [seg(airport, hotel)]);
ok("preco contratado tem preferencia", (await q("select total_cents t from public.bookings where id=$1", [b4]))[0].t === 18000);
const b5 = await create(agentA, agA, pax, [seg(airport, hotel)]);
ok("contrato da B nao vale para a A", (await q("select total_cents t from public.bookings where id=$1", [b5]))[0].t === 20000);

// Operacao GoTransfer age pela agencia; agencia suspensa nao opera
await as(admin, () => q("select public.cancel_booking($1,'Cancelamento administrativo')", [b4]));
ok("operacao GoTransfer cancela pela agencia", (await q("select status from public.bookings where id=$1", [b4]))[0].status === "cancelled");
ok("evento administrativo nao existe para reserva nao confirmada", (await q("select count(*)::int c from public.services where booking_id=$1", [b4]))[0].c === 0);
await q("update public.organizations set status='suspended' where id=$1", [agA]);
await fails("agencia suspensa nao reserva", agentA, CREATE, [agA, pax, JSON.stringify([seg(airport, hotel)])], "NOT_ALLOWED");
await fails("agencia suspensa nao cadastra passageiro", agentA, "insert into public.passengers (organization_id, full_name) values ($1,'Outro')", [agA], "row-level security");
ok("agencia suspensa ainda consulta suas reservas", (await as(agentA, () => q("select id from public.bookings"))).length === 4);

console.log(`\n${pass} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
