"use client";

import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  INITIAL_OFFERS,
  INITIAL_SERVICES,
  STEP_ORDER,
  type DriverService,
  type Offer,
  type Step,
} from "@/lib/driver/mock";

// Estado do modo demonstração. Fica na memória enquanto o app está aberto.
// Na versão real, aceite e etapas são comandos no servidor (o app não decide sozinho).

type LiveOffer = Offer & { expiresAt: number };

type DriverState = {
  online: boolean;
  setOnline: (value: boolean) => void;
  now: number;
  services: DriverService[];
  offers: LiveOffer[];
  acceptOffer: (offerId: string) => DriverService | null;
  declineOffer: (offerId: string) => void;
  advanceStep: (serviceId: string) => void;
  incidents: Record<string, string>;
  reportIncident: (serviceId: string, type: string) => void;
  uploadedDocs: string[];
  markDocUploaded: (docId: string) => void;
  /** Aviso curto no rodapé (ex.: ação que só existe na versão ligada ao sistema). */
  notify: (message: string) => void;
};

const DriverContext = createContext<DriverState | null>(null);

export function DriverProvider({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [services, setServices] = useState<DriverService[]>(INITIAL_SERVICES);
  const [offers, setOffers] = useState<LiveOffer[]>(() =>
    INITIAL_OFFERS.map((o) => ({ ...o, expiresAt: Date.now() + o.expiresInSec * 1000 })),
  );
  const [incidents, setIncidents] = useState<Record<string, string>>({});
  const [uploadedDocs, setUploadedDocs] = useState<string[]>([]);
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);

  const notify = useCallback((message: string) => setToast({ id: Date.now(), message }), []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  // Relógio das ofertas: só roda enquanto há ofertas abertas.
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

  const advanceStep = useCallback((serviceId: string) => {
    setServices((current) =>
      current.map((s) => {
        if (s.id !== serviceId) return s;
        const next = STEP_ORDER[STEP_ORDER.indexOf(s.step) + 1] as Step | undefined;
        return next ? { ...s, step: next } : s;
      }),
    );
  }, []);

  const reportIncident = useCallback((serviceId: string, type: string) => {
    setIncidents((current) => ({ ...current, [serviceId]: type }));
  }, []);

  const markDocUploaded = useCallback((docId: string) => {
    setUploadedDocs((current) => (current.includes(docId) ? current : [...current, docId]));
  }, []);

  const value = useMemo<DriverState>(
    () => ({
      online,
      setOnline,
      now,
      services,
      offers: online ? offers : [],
      acceptOffer,
      declineOffer,
      advanceStep,
      incidents,
      reportIncident,
      uploadedDocs,
      markDocUploaded,
      notify,
    }),
    [online, now, services, offers, acceptOffer, declineOffer, advanceStep, incidents, reportIncident, uploadedDocs, markDocUploaded, notify],
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
