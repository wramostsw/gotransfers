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
const call = (uid, sql, p) => as(uid, () => q(sql, p));
const fails = async (name, uid, sql, p, expect) => {
  try {
    await call(uid, sql, p);
    ok(name, false, "nao falhou");
  } catch (e) {
    ok(name, String(e.message).includes(expect), `erro: ${e.message}`);
  }
};

// ---------------------------------------------------------------- cenario
const user = async (email) => (await q("insert into auth.users (email) values ($1) returning id", [email]))[0].id;
const admin = await user("admin@x");
const agent = await user("agent@x");
const c1 = await user("c1@x");
const c2 = await user("c2@x");
const c3 = await user("c3@x");
const drvUser = await user("drv@x");
const drv2User = await user("drv2@x");
const org = async (type, name, individual = false) =>
  (await q("insert into public.organizations (type, legal_name, trade_name, status, is_individual) values ($1,$2,$2,'active',$3) returning id", [type, name, individual]))[0].id;
const platform = (await q("select id from public.organizations where type='platform'"))[0].id;
const agency = await org("agency", "Agencia");
const car1 = await org("transport_company", "Transp 1");
const car2 = await org("transport_company", "Transp 2");
const car3 = await org("transport_company", "Autonomo 3", true);
const carEmpty = await org("transport_company", "Sem frota");
const mem = (u, o, r) => q("insert into public.memberships (user_id, organization_id, role) values ($1,$2,$3)", [u, o, r]);
await mem(admin, platform, "superadmin");
await mem(agent, agency, "agency_admin");
await mem(c1, car1, "carrier_admin");
await mem(c2, car2, "carrier_dispatcher");
await mem(c3, car3, "carrier_admin");
const sedan = (await q("select id from public.vehicle_categories where slug='sedan'"))[0].id;
const van = (await q("select id from public.vehicle_categories where slug='van'"))[0].id;
let plateN = 0;
const vehicle = async (o, cat, seats = 4, extra = "approved") =>
  (
    await q(
      "insert into public.vehicles (organization_id, category_id, brand, model, model_year, plate, seats, luggage_large, luggage_medium, approval_status) values ($1,$2,'Marca','Modelo',2024,$3,$4,3,2,$5) returning id",
      [o, cat, `TST${String(++plateN).padStart(4, "0")}`, seats, extra],
    )
  )[0].id;
const driver = async (o, name, uid = null, expires = "2030-01-01", approval = "approved") =>
  (
    await q(
      "insert into public.drivers (organization_id, full_name, license_number, license_category, license_expires_at, user_id, approval_status) values ($1,$2,$3,'B',$4,$5,$6) returning id",
      [o, name, `CNH${++plateN}00000`, expires, uid, approval],
    )
  )[0].id;
const v1 = await vehicle(car1, sedan);
const v1b = await vehicle(car1, sedan);
const v1van = await vehicle(car1, van, 15);
const d1 = await driver(car1, "Motorista Um", drvUser);
const d1b = await driver(car1, "Motorista Um B", drv2User);
const d1expired = await driver(car1, "CNH vencida", null, "2020-01-01");
const v2 = await vehicle(car2, sedan);
const d2 = await driver(car2, "Motorista Dois");
const v3 = await vehicle(car3, sedan);
const d3 = await driver(car3, "Autonomo Tres", c3);
await vehicle(carEmpty, sedan, 4, "pending");
await driver(carEmpty, "Pendente", null, "2030-01-01", "pending");
if (drvUser) await mem(drvUser, car1, "driver");

const loc = async (name) => (await q("insert into public.locations (kind, name, city, state) values ('hotel',$1,'Cidade','MG') returning id", [name]))[0].id;
const A = await loc("Aeroporto");
const H = await loc("Hotel");
await q("insert into public.pricing_rules (name, mode, sale_price_cents, take_bps) values ('Geral','fixed',20000,2400)");
const pax = (await q("insert into public.passengers (organization_id, full_name, phone) values ($1,'Maria Passageira','31999990000') returning id", [agency]))[0].id;
const at = (h) => new Date(Date.now() + h * 3600e3).toISOString();
const newService = async (hours, extra = {}) => {
  const seg = { service_kind: "airport_arrival", origin_location_id: A, destination_location_id: H, pickup_at: at(hours), pax_count: 2, category_id: sedan, notes: "Placa com nome", ...extra };
  const b = (await call(agent, "select public.create_booking($1,$2,$3::jsonb) as id", [agency, pax, JSON.stringify([seg])]))[0].id;
  await call(agent, "select public.confirm_booking($1)", [b]);
  const s = (await q("select id, segment_id from public.services where booking_id=$1", [b]))[0];
  return { booking: b, service: s.id, segment: s.segment_id };
};
const svc = async (id) => (await q("select * from public.services where id=$1", [id]))[0];
const offers = (id) => q("select * from public.service_offers where service_id=$1 order by round, position", [id]);
const ledgerNet = async (service) => {
  const rows = await q("select account, organization_id, direction, amount_cents from public.ledger_entries where service_id=$1", [service]);
  const net = {};
  for (const r of rows) {
    const k = r.account + (r.organization_id && r.account === "provider_payable" ? ":" + r.organization_id : "");
    net[k] = (net[k] ?? 0) + (r.direction === "debit" ? 1 : -1) * Number(r.amount_cents);
  }
  return net;
};

// ---------------------------------------------------------------- elegibilidade
const s1 = await newService(48);
const elig = (await call(admin, "select public.list_eligible_providers($1) as r", [s1.service]))[0].r;
ok("elegiveis: 3 com frota aprovada, sem a empresa sem frota", elig.length === 3 && !elig.some((e) => e.org_id === carEmpty), JSON.stringify(elig));
await fails("agencia nao lista prestadores", agent, "select public.list_eligible_providers($1)", [s1.service], "NOT_ALLOWED");
await fails("transportadora nao distribui", c1, "select public.dispatch_service($1,'simultaneous')", [s1.service], "NOT_ALLOWED");
await fails("agencia nao distribui", agent, "select public.dispatch_service($1,'simultaneous')", [s1.service], "NOT_ALLOWED");
await fails("direcionada exige um prestador", admin, "select public.dispatch_service($1,'directed')", [s1.service], "INVALID_DISPATCH");
await fails("prestador sem frota e recusado", admin, "select public.dispatch_service($1,'directed',$2)", [s1.service, [carEmpty]], "NO_ELIGIBLE_PROVIDER");

// ---------------------------------------------------------------- simultanea
const n = (await call(admin, "select public.dispatch_service($1,'simultaneous',null,600) as n", [s1.service]))[0].n;
let of = await offers(s1.service);
ok("simultanea: 3 ofertas pendentes com repasse de 152,00", n === 3 && of.every((o) => o.status === "pending" && o.payout_cents === 15200) && (await svc(s1.service)).status === "offered");
const o1 = of.find((o) => o.provider_org_id === car1);
const o2 = of.find((o) => o.provider_org_id === car2);
const o3 = of.find((o) => o.provider_org_id === car3);

const list1 = (await call(c1, "select public.provider_offers($1) as r", [car1]))[0].r;
ok(
  "transportadora ve a oferta sem preco da agencia e sem passageiro",
  list1.length === 1 && list1[0].payout_cents === 15200 && !("passenger" in list1[0]) && !("notes" in list1[0]) && !JSON.stringify(list1[0]).includes("20000") && list1[0].origin.name === "Aeroporto",
  JSON.stringify(list1[0]),
);
await fails("transportadora nao ve ofertas de outra", c1, "select public.provider_offers($1)", [car2], "NOT_ALLOWED");
ok("RLS: transportadora so le as proprias ofertas", (await call(c1, "select id from public.service_offers")).length === 1);
ok("RLS: agencia nao le ofertas", (await call(agent, "select id from public.service_offers")).length === 0);
ok("transportadora continua sem ler reservas e trechos", (await call(c1, "select id from public.booking_segments")).length === 0 && (await call(c1, "select id from public.bookings")).length === 0);
await fails("nao responde oferta de outra empresa", c1, "select public.respond_offer($1,true)", [o2.id], "NOT_ALLOWED");
await fails("agencia nao aceita oferta", agent, "select public.respond_offer($1,true)", [o1.id], "NOT_ALLOWED");

ok("primeiro aceite vence", (await call(c2, "select public.respond_offer($1,true) as r", [o2.id]))[0].r === "accepted");
await fails("segundo aceite e recusado", c1, "select public.respond_offer($1,true)", [o1.id], "OFFER_UNAVAILABLE");
ok("repetir o proprio aceite nao da erro", (await call(c2, "select public.respond_offer($1,true) as r", [o2.id]))[0].r === "accepted");
of = await offers(s1.service);
let s = await svc(s1.service);
ok(
  "vencedor vinculado, demais ofertas canceladas, aguardando designacao",
  s.provider_org_id === car2 && s.status === "awaiting_assignment" && of.filter((o) => o.status === "accepted").length === 1 && of.filter((o) => o.status === "cancelled").length === 2,
);
let net = await ledgerNet(s1.service);
ok("repasse passou do provisionado para o prestador", net.provider_accrual === 0 && net[`provider_payable:${car2}`] === -15200 && net.agency_receivable === 20000, JSON.stringify(net));
await q("insert into public.memberships (user_id, organization_id, role) values ($1,$2,'carrier_admin')", [c2, car2]);
const led2 = await call(c2, "select account, amount_cents from public.ledger_entries");
ok("admin da transportadora le so o proprio repasse", led2.length === 1 && led2[0].account === "provider_payable", JSON.stringify(led2));
ok("outra transportadora nao le", (await call(c1, "select id from public.ledger_entries")).length === 0);

// ---------------------------------------------------------------- designacao
await fails("outra empresa nao designa", c1, "select public.assign_service($1,$2,$3)", [s1.service, d1, v1], "NOT_ALLOWED");
await fails("motorista de outra empresa e recusado", c2, "select public.assign_service($1,$2,$3)", [s1.service, d1, v2], "DRIVER_NOT_ELIGIBLE");
await fails("veiculo de outra empresa e recusado", c2, "select public.assign_service($1,$2,$3)", [s1.service, d2, v1], "VEHICLE_NOT_ELIGIBLE");
await call(c2, "select public.assign_service($1,$2,$3)", [s1.service, d2, v2]);
s = await svc(s1.service);
ok("designado", s.status === "assigned" && s.driver_id === d2 && s.vehicle_id === v2);
const mine = (await call(c2, "select public.provider_services($1) as r", [car2]))[0].r;
ok(
  "apos aceitar, a transportadora ve passageiro e observacao, sem o preco da agencia",
  mine.length === 1 && mine[0].passenger.name === "Maria Passageira" && mine[0].notes === "Placa com nome" && mine[0].payout_cents === 15200 && !JSON.stringify(mine[0]).includes("20000"),
  JSON.stringify(mine[0]),
);
await fails("substituir exige justificativa", c2, "select public.assign_service($1,$2,$3)", [s1.service, d2, v2], "REASON_REQUIRED");

// conflito de agenda: outro servico 1h depois, mesmo motorista
const s2 = await newService(49);
await call(admin, "select public.dispatch_service($1,'directed',$2,600)", [s2.service, [car2]]);
const o22 = (await offers(s2.service))[0];
await call(c2, "select public.respond_offer($1,true)", [o22.id]);
await fails("conflito de agenda bloqueia a designacao", c2, "select public.assign_service($1,$2,$3)", [s2.service, d2, v2], "SCHEDULE_CONFLICT");
await call(c2, "select public.release_service($1,'Sem motorista livre')", [s2.service]);
s = await svc(s2.service);
net = await ledgerNet(s2.service);
ok("liberar devolve a central e desfaz o repasse", s.status === "awaiting_dispatch" && s.provider_org_id === null && net.provider_accrual === -15200 && (net[`provider_payable:${car2}`] ?? 0) === 0, JSON.stringify(net));

// ---------------------------------------------------------------- sequencial
await call(admin, "select public.dispatch_service($1,'sequential',$2,600)", [s2.service, [car3, car1]]);
of = (await offers(s2.service)).filter((o) => o.round === 2);
ok("sequencial: o primeiro pendente, o segundo na fila, na ordem pedida", of.length === 2 && of[0].provider_org_id === car3 && of[0].status === "pending" && of[1].provider_org_id === car1 && of[1].status === "queued", JSON.stringify(of.map((o) => [o.status, o.position])));
ok("quem esta na fila ainda nao ve a oferta", (await call(c1, "select public.provider_offers($1) as r", [car1]))[0].r.filter((o) => o.service_id === s2.service && o.status === "pending").length === 0);
await fails("quem esta na fila nao aceita antes da vez", c1, "select public.respond_offer($1,true)", [of[1].id], "OFFER_UNAVAILABLE");
ok("recusa com motivo", (await call(c3, "select public.respond_offer($1,false,'Agenda cheia') as r", [of[0].id]))[0].r === "declined");
of = (await offers(s2.service)).filter((o) => o.round === 2);
ok("recusa chama o proximo da fila", of[0].status === "declined" && of[0].decline_reason === "Agenda cheia" && of[1].status === "pending" && of[1].expires_at !== null);

// expiracao
await q("update public.service_offers set expires_at = now() - interval '1 minute' where id=$1", [of[1].id]);
await fails("oferta vencida nao pode ser aceita", c1, "select public.respond_offer($1,true)", [of[1].id], "OFFER_EXPIRED");
await call(c1, "select public.provider_offers($1)", [car1]);
s = await svc(s2.service);
ok("sem aceite, o servico volta para a central", s.status === "awaiting_dispatch" && (await offers(s2.service)).find((o) => o.id === of[1].id).status === "expired");
const lastEvent = (await q("select origin, reason from public.service_events where service_id=$1 order by id desc limit 1", [s2.service]))[0];
ok("evento registrado pelo sistema", lastEvent.origin === "system", JSON.stringify(lastEvent));

// ---------------------------------------------------------------- manual
await fails("manual exige justificativa", admin, "select public.assign_service_manual($1,$2,$3,$4,' ')", [s2.service, car1, d1, v1], "REASON_REQUIRED");
await fails("manual valida CNH", admin, "select public.assign_service_manual($1,$2,$3,$4,'teste')", [s2.service, car1, d1expired, v1], "DRIVER_NOT_ELIGIBLE");
await fails("manual valida categoria do veiculo", admin, "select public.assign_service_manual($1,$2,$3,$4,'teste')", [s2.service, car1, d1, v1van], "VEHICLE_NOT_ELIGIBLE");
await fails("transportadora nao atribui manualmente", c1, "select public.assign_service_manual($1,$2,$3,$4,'teste')", [s2.service, car1, d1, v1], "NOT_ALLOWED");
await call(admin, "select public.assign_service_manual($1,$2,$3,$4,'Cliente pediu esta empresa')", [s2.service, car1, d1, v1]);
s = await svc(s2.service);
net = await ledgerNet(s2.service);
ok("atribuicao manual vincula prestador, motorista e veiculo", s.status === "assigned" && s.provider_org_id === car1 && s.driver_id === d1 && net[`provider_payable:${car1}`] === -15200 && net.provider_accrual === 0, JSON.stringify(net));
await call(c1, "select public.assign_service($1,$2,$3,'Motorista doente')", [s2.service, d1b, v1b]);
const asg = await q("select is_active, driver_id from public.service_assignments where service_id=$1 order by created_at", [s2.service]);
ok("substituicao mantem historico e uma unica atribuicao ativa", asg.length === 2 && asg.filter((a) => a.is_active).length === 1 && asg[1].driver_id === d1b && (await svc(s2.service)).driver_id === d1b);
await call(c1, "select public.assign_service($1,$2,$3,'Voltou')", [s2.service, d1, v1]);

// ---------------------------------------------------------------- motorista
const mineDrv = (await call(drvUser, "select public.driver_services() as r"))[0].r;
ok(
  "motorista ve so o seu servico, com passageiro e sem valores (empresa)",
  mineDrv.length === 1 && mineDrv[0].service_id === s2.service && mineDrv[0].passenger.phone === "31999990000" && mineDrv[0].payout_cents === null && !JSON.stringify(mineDrv[0]).includes("20000"),
  JSON.stringify(mineDrv),
);
ok("outro motorista nao ve", (await call(drv2User, "select public.driver_services() as r"))[0].r.length === 0);
await fails("outro motorista nao avanca o servico", drv2User, "select public.driver_advance_service($1,'driver_en_route')", [s2.service], "NOT_ALLOWED");
await fails("gestor nao avanca pelo motorista", c1, "select public.driver_advance_service($1,'driver_en_route')", [s2.service], "NOT_ALLOWED");
await fails("nao pula etapas", drvUser, "select public.driver_advance_service($1,'in_progress')", [s2.service], "INVALID_TRANSITION");
await fails("nao conclui sem executar", drvUser, "select public.driver_advance_service($1,'completed')", [s2.service], "INVALID_TRANSITION");
await call(drvUser, "select public.driver_advance_service($1,'driver_en_route')", [s2.service]);
await call(drvUser, "select public.driver_advance_service($1,'driver_en_route')", [s2.service]);
ok("toque repetido nao duplica evento", (await q("select count(*)::int c from public.service_events where service_id=$1 and to_status='driver_en_route'", [s2.service]))[0].c === 1);
ok("reserva em andamento", (await q("select status from public.bookings where id=$1", [s2.booking]))[0].status === "in_progress");
await fails("agencia nao cancela servico em execucao", agent, "select public.cancel_booking($1,'tarde demais')", [s2.booking], "SERVICE_IN_EXECUTION");
await fails("nao troca motorista em execucao", c1, "select public.assign_service($1,$2,$3,'troca')", [s2.service, d1b, v1b], "INVALID_STATE");
for (const step of ["driver_arrived", "boarding", "in_progress", "completed"]) await call(drvUser, "select public.driver_advance_service($1,$2)", [s2.service, step]);
s = await svc(s2.service);
ok(
  "servico, trecho e reserva concluidos",
  s.status === "completed" && (await q("select status from public.booking_segments where id=$1", [s2.segment]))[0].status === "completed" && (await q("select status from public.bookings where id=$1", [s2.booking]))[0].status === "completed",
);
const ev = (await q("select to_status, origin from public.service_events where service_id=$1 and origin='driver' order by id", [s2.service])).map((e) => e.to_status).join();
ok("historico completo da execucao", ev === "driver_en_route,driver_arrived,boarding,in_progress,completed", ev);
ok("agencia acompanha os eventos", (await call(agent, "select id from public.service_events where service_id=$1", [s2.service])).length >= 8);

// autonomo ve o valor
const s3 = await newService(96);
await call(admin, "select public.assign_service_manual($1,$2,$3,$4,'Autonomo de confianca')", [s3.service, car3, d3, v3]);
const solo = (await call(c3, "select public.driver_services() as r"))[0].r;
ok("autonomo ve o proprio valor", solo.length === 1 && solo[0].payout_cents === 15200);

// ---------------------------------------------------------------- cancelamento apos designacao
await call(agent, "select public.cancel_booking($1,'Cliente cancelou')", [s1.booking]);
net = await ledgerNet(s1.service);
s = await svc(s1.service);
ok(
  "cancelar reserva designada zera todas as contas e encerra a atribuicao",
  s.status === "cancelled" && Object.values(net).every((v) => v === 0) && (await q("select count(*)::int c from public.service_assignments where service_id=$1 and is_active", [s1.service]))[0].c === 0,
  JSON.stringify(net),
);
ok("serviço cancelado some da agenda do prestador ativo", (await call(c2, "select public.provider_services($1) as r", [car2]))[0].r.filter((x) => x.status !== "cancelled").length === 0);

// cancelar com ofertas abertas
const s4 = await newService(120);
await call(admin, "select public.dispatch_service($1,'simultaneous',null,600)", [s4.service]);
await call(agent, "select public.cancel_booking($1,'Desistiu')", [s4.booking]);
ok("cancelar encerra ofertas abertas", (await offers(s4.service)).every((o) => o.status === "cancelled"));
const o4 = (await offers(s4.service))[0];
const who4 = o4.provider_org_id === car1 ? c1 : o4.provider_org_id === car2 ? c2 : c3;
await fails("oferta de servico cancelado nao pode ser aceita", who4, "select public.respond_offer($1,true)", [o4.id], "OFFER_UNAVAILABLE");

// interromper e empresa suspensa
const s5 = await newService(130);
await call(admin, "select public.dispatch_service($1,'simultaneous',null,600)", [s5.service]);
await q("update public.organizations set status='suspended' where id=$1", [car1]);
const o5 = (await offers(s5.service)).find((o) => o.provider_org_id === car1);
await fails("empresa suspensa nao aceita oferta", c1, "select public.respond_offer($1,true)", [o5.id], "NOT_ALLOWED");
await call(admin, "select public.stop_dispatch($1,'Rever preco')", [s5.service]);
ok("interromper devolve a central e cancela ofertas", (await svc(s5.service)).status === "awaiting_dispatch" && (await offers(s5.service)).every((o) => o.status === "cancelled"));
const again = (await call(admin, "select public.dispatch_service($1,'simultaneous',null,600) as n", [s5.service]))[0].n;
ok("nova rodada ignora a empresa suspensa", again === 2 && (await svc(s5.service)).distribution_round === 2);

// integridade geral do livro-razao
const unbalanced = await q("select tx_id from public.ledger_entries group by tx_id having sum(case direction when 'debit' then amount_cents else -amount_cents end) <> 0");
ok("todas as transacoes do livro-razao fecham em zero", unbalanced.length === 0);

console.log(`\n${pass} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
