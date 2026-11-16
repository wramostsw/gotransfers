"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { signOut } from "@/app/(auth)/actions";
import { Icon } from "@/components/icons";
import { useDriver } from "../driver-store";
import { BottomNav } from "../ui";

export function ProfileScreen() {
  const { uploadedDocs, markDocUploaded, notify, profile: DRIVER } = useDriver();
  const DOCUMENTS = DRIVER.documents;
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const pending = DOCUMENTS.filter((d) => d.status === "expiring" && !uploadedDocs.includes(d.id)).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-3.5 border-b border-line bg-surface px-5 pb-4.5 pt-4">
        <div aria-hidden className="grid size-16 place-items-center rounded-full bg-accent-300 font-display text-[22px] font-extrabold text-brand-900">
          {DRIVER.initials}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[22px] font-extrabold">{DRIVER.name}</h1>
          <p className="mt-0.5 text-[13px] text-muted">
            {DRIVER.carrier}{DRIVER.rating ? ` · ★ ${DRIVER.rating}` : ""} · {DRIVER.totalServices} serviços
          </p>
          <span className="mt-1.5 inline-block rounded-full bg-success-50 px-2.5 py-0.5 text-[11px] font-bold text-success-700">Cadastro aprovado</span>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
        <section className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-[17px] font-extrabold">Documentos</h2>
            <span className={`text-[13px] font-semibold ${pending ? "text-warning-700" : "text-success-700"}`}>
              {pending ? `${pending} pendência` : "Tudo em dia"}
            </span>
          </div>
          <ul className="overflow-hidden rounded-[18px] border border-line bg-surface">
            {DOCUMENTS.map((doc, i) => {
              const uploaded = uploadedDocs.includes(doc.id);
              const expiring = doc.status === "expiring" && !uploaded;
              return (
                <li
                  key={doc.id}
                  className={`flex items-center gap-3 px-4 py-3 ${i < DOCUMENTS.length - 1 ? "border-b border-canvas" : ""} ${expiring ? "bg-[#FFFBEB]" : ""}`}
                >
                  <span
                    aria-hidden
                    className={`grid size-9 shrink-0 place-items-center rounded-[10px] ${
                      expiring ? "bg-warning-50 text-warning-700" : uploaded ? "bg-brand-100/70 text-brand-800" : "bg-success-50 text-success-700"
                    }`}
                  >
                    <Icon name={expiring ? "alert" : uploaded ? "clock" : "check"} size={18} strokeWidth={2.2} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold">{doc.title}</p>
                    <p className={`mt-0.5 text-xs ${expiring ? "text-warning-700" : "text-muted"}`}>
                      {uploaded ? "Novo arquivo enviado · em análise" : doc.detail}
                    </p>
                  </div>
                  {expiring ? (
                    <button
                      type="button"
                      onClick={() => {
                        setUploadingFor(doc.id);
                        fileInput.current?.click();
                      }}
                      className="h-10 shrink-0 rounded-xl bg-brand-800 px-3 text-[13px] font-bold text-white"
                    >
                      Enviar
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <input
            ref={fileInput}
            type="file"
            accept="image/*,application/pdf"
            hidden
            onChange={(e) => {
              if (e.target.files?.length && uploadingFor) {
                markDocUploaded(uploadingFor);
                notify("Documento recebido. Na versão final, ele vai para análise da GoTransfer.");
              }
              e.target.value = "";
              setUploadingFor(null);
            }}
          />
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-display text-[17px] font-extrabold">Veículo em uso</h2>
          <div className="flex items-center gap-3 rounded-[18px] border border-line bg-surface px-4 py-3.5">
            <span aria-hidden className="grid size-11 place-items-center rounded-xl bg-brand-100/70 text-brand-800">
              <Icon name="car" />
            </span>
            <div>
              <p className="text-[15px] font-bold">{DRIVER.vehicle?.name ?? "Nenhum veículo designado"}</p>
              <p className="mt-0.5 text-xs text-muted">
                {DRIVER.vehicle
                  ? [DRIVER.vehicle.plate, DRIVER.vehicle.category, DRIVER.vehicle.seats ? `${DRIVER.vehicle.seats} passageiros` : null, DRIVER.vehicle.luggageLarge ? `${DRIVER.vehicle.luggageLarge} malas grandes` : null].filter(Boolean).join(" · ")
                  : "O veículo aparece quando sua empresa designar um serviço."}
              </p>
            </div>
          </div>
        </section>

        <ul className="overflow-hidden rounded-[18px] border border-line bg-surface">
          <Row label="Idiomas" value={DRIVER.languages} onClick={() => notify("Na versão final, você ajusta seus idiomas aqui.")} />
          <Row label="Notificações" value="Ativadas" onClick={() => notify("Na versão final, você escolhe quais avisos receber.")} />
          <Row label="Ajuda e suporte" onClick={() => notify("Na versão final, abre o atendimento GoTransfer.")} />
          <li>
            <Link href="/inicio" className="flex min-h-13 items-center border-b border-canvas px-4 text-[15px] font-semibold">
              Trocar de área
            </Link>
          </li>
          <li>
            <form action={signOut}>
              <button className="flex min-h-13 w-full items-center px-4 text-[15px] font-semibold text-danger-700">Sair</button>
            </form>
          </li>
        </ul>
      </main>
      <BottomNav />
    </div>
  );
}

function Row({ label, value, onClick }: { label: string; value?: string; onClick: () => void }) {
  return (
    <li>
      <button type="button" onClick={onClick} className="flex min-h-13 w-full items-center justify-between gap-3 border-b border-canvas px-4 text-left text-[15px] font-semibold">
        {label}
        {value ? (
          <span className="text-[13px] font-medium text-muted">{value}</span>
        ) : (
          <Icon name="chevronRight" size={18} strokeWidth={2} className="text-muted" />
        )}
      </button>
    </li>
  );
}
