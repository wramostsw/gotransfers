"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Icon } from "@/components/icons";
import { useDriver } from "../../../driver-store";
import { BackHeader } from "../../../ui";

const TYPES = ["Atraso", "Passageiro ausente", "Endereço errado", "Voo alterado", "Veículo avariado", "Outro"];

export function IncidentScreen() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { services, reportIncident } = useDriver();
  const s = services.find((x) => x.id === id);
  const [type, setType] = useState("");
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  // Libera da memória as prévias das fotos só ao sair da tela.
  const photosRef = useRef<string[]>([]);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);
  useEffect(() => () => photosRef.current.forEach((url) => URL.revokeObjectURL(url)), []);

  function addPhotos(files: FileList | null) {
    if (!files) return;
    const urls = [...files].filter((f) => f.type.startsWith("image/")).slice(0, 4 - photos.length).map((f) => URL.createObjectURL(f));
    setPhotos((current) => [...current, ...urls]);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!type) {
      setError("Escolha o que aconteceu.");
      return;
    }
    if (text.trim().length < 5) {
      setError("Descreva em poucas palavras o que aconteceu.");
      return;
    }
    reportIncident(id, type);
    router.push(`/motorista/servico/${id}/execucao`);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <BackHeader
        href={`/motorista/servico/${id}/execucao`}
        title="Registrar ocorrência"
        subtitle={s ? `Serviço ${s.code} · ${s.pickup.title.split(" · ")[0]}` : undefined}
      />
      <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pb-[max(env(safe-area-inset-bottom),1.25rem)] pt-4">
        <p className="flex gap-2.5 rounded-[14px] bg-danger-50 px-3.5 py-3 text-[13px] font-semibold leading-relaxed text-[#8C1D16]">
          <Icon name="alert" size={18} strokeWidth={2} className="mt-px shrink-0" />
          Em acidente ou emergência, ligue 190 ou 192 antes de registrar.
        </p>

        {error ? (
          <p role="alert" className="rounded-[14px] bg-warning-50 px-3.5 py-3 text-sm font-semibold text-warning-700">
            {error}
          </p>
        ) : null}

        <fieldset className="flex flex-col gap-2.5">
          <legend className="mb-2.5 text-[15px] font-bold">O que aconteceu?</legend>
          <div className="grid grid-cols-2 gap-2">
            {TYPES.map((t) => (
              <label
                key={t}
                className={`flex min-h-12 cursor-pointer items-center gap-2.5 rounded-[14px] px-3 text-sm ${
                  type === t ? "border-2 border-brand-800 bg-brand-100/60 font-bold" : "border border-line bg-surface font-semibold"
                }`}
              >
                <input
                  type="radio"
                  name="tipo"
                  value={t}
                  checked={type === t}
                  onChange={() => {
                    setType(t);
                    setError("");
                  }}
                  className="size-4.5 accent-brand-800"
                />
                {t}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="flex flex-col gap-2 text-[15px] font-bold">
          Descreva
          <textarea
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={500}
            placeholder="Ex.: no portão B desde 14:00, passageira não atende o telefone."
            className="resize-none rounded-[14px] border border-line bg-surface px-3.5 py-3 text-[15px] font-normal leading-relaxed placeholder:text-muted/70"
          />
        </label>

        <div className="flex flex-col gap-2">
          <p className="text-[15px] font-bold">
            Fotos <span className="font-medium text-muted">(opcional, até 4)</span>
          </p>
          <div className="flex flex-wrap gap-2.5">
            {photos.map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element -- prévia local do arquivo escolhido
              <img key={url} src={url} alt={`Foto ${i + 1} anexada`} className="size-21 rounded-[14px] object-cover" />
            ))}
            {photos.length < 4 ? (
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="flex size-21 flex-col items-center justify-center gap-1 rounded-[14px] border-[1.5px] border-dashed border-[#9AA8C4] bg-surface text-xs font-bold text-brand-800"
              >
                <Icon name="camera" size={22} />
                Adicionar
              </button>
            ) : null}
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              hidden
              onChange={(e) => {
                addPhotos(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
        </div>

        {s ? (
          <p className="rounded-[14px] bg-brand-100/60 px-3.5 py-3 text-[13px] leading-relaxed">
            Tolerância contratada: {s.toleranceMin} min. A central acompanha e avisa a agência antes de liberar você.
          </p>
        ) : null}

        <button type="submit" className="mt-auto h-14 rounded-2xl bg-brand-800 text-base font-bold text-white hover:bg-brand-700">
          Enviar à central
        </button>
      </form>
    </div>
  );
}
