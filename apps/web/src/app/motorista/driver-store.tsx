"use client";

import { useRouter } from "next/navigation";
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { driverAdvance } from "@/lib/dispatch-actions";
import { INITIAL_OFFERS, STEP_ORDER, type DriverProfile, type DriverService, type Offer, type Step } from "@/lib/driver/mock";

// Dois modos:
// - real (live): serviços vêm do banco e cada etapa é um comando no servidor; a tela só
//   avança depois que o banco aceita. Ofertas vão para a empresa, não para o motorista.
// - demonstração: dados fictícios na memória, para a equipe GoTransfer conhecer o app.

type LiveOffer = Offer & { expiresAt: number };

const STATUS_BY_STEP: Record<Step, string> = {
  assigned: "assigned",
  en_route: "driver_en_route",
  arrived: "driver_arrived",
  boarding: "boarding",
  in_progress: "in_progress",
  completed: "completed",
};

type DriverState = {
  live: boolean;
  profile: DriverProfile;
  online: boolean;
  setOnline: (value: boolean) => void;
  now: number;
  services: DriverService[];
  offers: LiveOffer[];
  acceptOffer: (offerId: string) => DriverService | null;
  declineOffer: (offerId: string) => void;
  advanceStep: (serviceId: string) => void;
  /** Serviço com etapa sendo gravada no servidor. */
  saving: string | null;
  incidents: Record<string, string>;
  reportIncident: (serviceId: string, type: string) => void;
  uploadedDocs: string[];
  markDocUploaded: (docId: string) => void;
  /** Aviso curto no rodapé. */
  notify: (message: string) => void;
};

const DriverContext = createContext<DriverState | null>(null);

export function DriverProvider({
  live,
  profile,
  initialServices,
  children,
}: {
  live: boolean;
  profile: DriverProfile;
  initialServices: DriverService[];
  children: ReactNode;
}) {
  const router = useRouter();
  const [online, setOnline] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [services, setServices] = useState<DriverService[]>(initialServices);
  // Quando o servidor manda dados novos (após uma etapa ou atualização), eles valem.
  const [source, setSource] = useState(initialServices);
  if (source !== initialServices) {
    setSource(initialServices);
    setServices(initialServices);
  }
  const [offers, setOffers] = useState<LiveOffer[]>(() =>
    live ? [] : INITIAL_OFFERS.map((o) => ({ ...o, expiresAt: Date.now() + o.expiresInSec * 1000 })),
  );
  const [saving, setSaving] = useState<string | null>(null);
  const [incidents, setIncidents] = useState<Record<string, string>>({});
  const [uploadedDocs, setUploadedDocs] = useState<string[]>([]);
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);

  const notify = useCallback((message: string) => setToast({ id: Date.now(), message }), []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3600);
    return () => clearTimeout(timer);
  }, [toast]);

  // Relógio das ofertas da demonstração.
  useEffect(() => {
    if (offers.length === 0) return;
    const timer = setInterval(() => {
      const t = Date.now();
      setNow(t);
      setOffers((current) => {
        const alive = current.filter((o) => o.expiresAt > t);
        return alive.length === current.length ? current : alive;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [offers.length]);

  // Modo real: busca novidades a cada minuto (novo serviço designado, troca de motorista).
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => router.refresh(), 60_000);
    return () => clearInterval(timer);
  }, [live, router]);

  const acceptOffer = useCallback(
    (offerId: string) => {
      const offer = offers.find((o) => o.id === offerId && o.expiresAt > Date.now());
      if (!offer) return null;
      setOffers((current) => current.filter((o) => o.id !== offerId));
      setServices((current) =>
        current.some((s) => s.id === offer.service.id) ? current : [...current, { ...offer.service, step: "assigned" }],
      );
      return offer.service;
    },
    [offers],
  );

  const declineOffer = useCallback((offerId: string) => {
    setOffers((current) => current.filter((o) => o.id !== offerId));
  }, []);

  const advanceStep = useCallback(
    (serviceId: string) => {
      const service = services.find((s) => s.id === serviceId);
      const next = service ? (STEP_ORDER[STEP_ORDER.indexOf(service.step) + 1] as Step | undefined) : undefined;
      if (!service || !next) return;
      const apply = () => setServices((current) => current.map((s) => (s.id === serviceId ? { ...s, step: next } : s)));
      if (!live) {
        apply();
        return;
      }
      if (saving) return;
      setSaving(serviceId);
      driverAdvance(serviceId, STATUS_BY_STEP[next])
        .then((error) => {
          if (error) {
            notify(error);
            router.refresh();
          } else {
            apply();
          }
        })
        .catch(() => notify("Sem conexão. A etapa não foi registrada; tente de novo."))
        .finally(() => setSaving(null));
    },
    [live, services, saving, notify, router],
  );

  const reportIncident = useCallback(
    (serviceId: string, type: string) => {
      setIncidents((current) => ({ ...current, [serviceId]: type }));
      if (live) notify("O registro de ocorrências no sistema chega na próxima etapa. Avise a central por telefone.");
    },
    [live, notify],
  );

  const markDocUploaded = useCallback((docId: string) => {
    setUploadedDocs((current) => (current.includes(docId) ? current : [...current, docId]));
  }, []);

  const value = useMemo<DriverState>(
    () => ({
      live,
      profile,
      online,
      setOnline,
      now,
      services,
      offers: online ? offers : [],
      acceptOffer,
      declineOffer,
      advanceStep,
      saving,
      incidents,
      reportIncident,
      uploadedDocs,
      markDocUploaded,
      notify,
    }),
    [live, profile, online, now, services, offers, acceptOffer, declineOffer, advanceStep, saving, incidents, reportIncident, uploadedDocs, markDocUploaded, notify],
  );

  return (
    <DriverContext value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none absolute inset-x-4 bottom-24 z-50 flex justify-center">
        {toast ? (
          <p key={toast.id} className="rounded-2xl bg-ink px-4 py-3 text-center text-sm font-semibold text-white shadow-xl">
            {toast.message}
          </p>
        ) : null}
      </div>
    </DriverContext>
  );
}

export function useDriver() {
  const ctx = use(DriverContext);
  if (!ctx) throw new Error("useDriver precisa estar dentro de DriverProvider");
  return ctx;
}

export function secondsLeft(offer: LiveOffer, now: number) {
  return Math.max(0, Math.round((offer.expiresAt - now) / 1000));
}

export function formatCountdown(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
