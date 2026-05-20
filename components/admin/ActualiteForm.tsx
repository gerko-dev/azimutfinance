"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createActualite, updateActualite } from "@/lib/actualites/actions";
import type { Actualite } from "@/lib/actualites/types";
import { NEWS_TYPES, NEWS_TYPE_LABELS, type NewsType } from "@/lib/newsTypes";

function fmtSize(bytes: number | null): string {
  if (bytes === null || !isFinite(bytes)) return "—";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} ko`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
}

export default function ActualiteForm({
  mode,
  initial,
}: {
  mode: "create" | "edit";
  initial?: Actualite;
}) {
  const router = useRouter();
  const [ticker, setTicker] = useState(initial?.ticker ?? "");
  const [category, setCategory] = useState<NewsType>(
    initial?.category ?? "communique",
  );
  const [title, setTitle] = useState(initial?.title ?? "");
  const [excerpt, setExcerpt] = useState(initial?.excerpt ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [sourceUrl, setSourceUrl] = useState(initial?.source_url ?? "");
  const [publish, setPublish] = useState(!!initial?.published_at);
  const [file, setFile] = useState<File | null>(null);
  const [removeAttachment, setRemoveAttachment] = useState(false);
  const [file2, setFile2] = useState<File | null>(null);
  const [removeAttachment2, setRemoveAttachment2] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  const hasExistingAttachment =
    !!initial?.attachment_path && !removeAttachment && !file;
  const hasExistingAttachment2 =
    !!initial?.attachment2_path && !removeAttachment2 && !file2;

  function submit() {
    if (!ticker.trim() || !title.trim() || !body.trim()) {
      setFeedback({ ok: false, msg: "Ticker, titre et corps obligatoires." });
      return;
    }
    setFeedback(null);

    const fd = new FormData();
    fd.append("ticker", ticker.trim().toUpperCase());
    fd.append("category", category);
    fd.append("title", title.trim());
    fd.append("excerpt", excerpt.trim());
    fd.append("body", body.trim());
    fd.append("source_url", sourceUrl.trim());
    if (publish) fd.append("publish", "1");
    if (file) fd.append("attachment", file);
    if (mode === "edit" && removeAttachment && !file) {
      fd.append("remove_attachment", "1");
    }
    if (file2) fd.append("attachment2", file2);
    if (mode === "edit" && removeAttachment2 && !file2) {
      fd.append("remove_attachment2", "1");
    }

    startTransition(async () => {
      const res =
        mode === "create"
          ? await createActualite(fd)
          : await updateActualite(initial!.id, fd);
      if (res.ok) {
        setFeedback({ ok: true, msg: "Enregistré." });
        if (mode === "create" && "data" in res && res.data && typeof res.data === "object" && "id" in res.data) {
          router.push(`/admin/actualites/${(res.data as { id: string }).id}`);
        } else {
          router.refresh();
        }
      } else {
        setFeedback({ ok: false, msg: res.error });
      }
    });
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-4">
      {feedback && (
        <div
          className={`text-xs px-3 py-2 rounded border ${
            feedback.ok
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          {feedback.msg}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[160px_180px_1fr] gap-4">
        <div>
          <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
            Ticker BRVM
          </label>
          <input
            type="text"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder="SONATEL, BICC..."
            maxLength={20}
            className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 font-mono"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
            Catégorie
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as NewsType)}
            className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 bg-white"
          >
            {NEWS_TYPES.map((t) => (
              <option key={t} value={t}>
                {NEWS_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
            Titre
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="SONATEL annonce un dividende exceptionnel pour 2026"
            maxLength={300}
            className="w-full text-sm border border-slate-300 rounded px-2 py-1.5"
          />
        </div>
      </div>

      <div>
        <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
          Chapeau / résumé (optionnel)
        </label>
        <textarea
          value={excerpt}
          onChange={(e) => setExcerpt(e.target.value)}
          placeholder="1-2 phrases qui résument l'actualité, affichées en preview."
          rows={2}
          maxLength={500}
          className="w-full text-sm border border-slate-300 rounded px-2 py-1.5"
        />
      </div>

      <div>
        <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
          Corps de l&apos;article (texte simple, support Markdown léger)
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={12}
          className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 font-mono"
        />
      </div>

      <div>
        <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
          Source URL externe (optionnel)
        </label>
        <input
          type="url"
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          placeholder="https://..."
          className="w-full text-sm border border-slate-300 rounded px-2 py-1.5"
        />
      </div>

      <AttachmentField
        label="Pièce jointe principale (PDF, DOCX, image — max 20 Mo)"
        existingName={initial?.attachment_name ?? null}
        existingSize={initial?.attachment_size_bytes ?? null}
        showExisting={hasExistingAttachment}
        markedForRemoval={!!(removeAttachment && initial?.attachment_path && !file)}
        onRemoveExisting={() => setRemoveAttachment(true)}
        onCancelRemove={() => setRemoveAttachment(false)}
        file={file}
        onFile={setFile}
      />

      <AttachmentField
        label="Pièce jointe secondaire (optionnelle)"
        existingName={initial?.attachment2_name ?? null}
        existingSize={initial?.attachment2_size_bytes ?? null}
        showExisting={hasExistingAttachment2}
        markedForRemoval={!!(removeAttachment2 && initial?.attachment2_path && !file2)}
        onRemoveExisting={() => setRemoveAttachment2(true)}
        onCancelRemove={() => setRemoveAttachment2(false)}
        file={file2}
        onFile={setFile2}
      />

      <div className="flex items-center justify-between pt-3 border-t border-slate-100">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={publish}
            onChange={(e) => setPublish(e.target.checked)}
            className="accent-slate-900"
          />
          Publier maintenant{" "}
          <span className="text-[11px] text-slate-400">
            (sinon : enregistré en brouillon)
          </span>
        </label>
        <button
          onClick={submit}
          disabled={isPending}
          className="text-sm bg-slate-900 hover:bg-slate-700 text-white font-medium px-4 py-2 rounded disabled:opacity-50"
        >
          {isPending ? "Enregistrement…" : mode === "create" ? "Créer" : "Mettre à jour"}
        </button>
      </div>
    </div>
  );
}

/** Champ d'upload d'une pièce jointe (existante remplacable / supprimable). */
function AttachmentField({
  label,
  existingName,
  existingSize,
  showExisting,
  markedForRemoval,
  onRemoveExisting,
  onCancelRemove,
  file,
  onFile,
}: {
  label: string;
  existingName: string | null;
  existingSize: number | null;
  showExisting: boolean;
  markedForRemoval: boolean;
  onRemoveExisting: () => void;
  onCancelRemove: () => void;
  file: File | null;
  onFile: (f: File | null) => void;
}) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
        {label}
      </label>
      {showExisting && existingName && (
        <div className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded px-3 py-2 mb-2 flex items-center justify-between">
          <span>
            📎 {existingName}{" "}
            <span className="text-slate-400">({fmtSize(existingSize)})</span>
          </span>
          <button
            type="button"
            onClick={onRemoveExisting}
            className="text-[11px] text-rose-700 hover:underline"
          >
            Supprimer
          </button>
        </div>
      )}
      {markedForRemoval && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-2 flex items-center justify-between">
          <span>La pièce jointe sera supprimée à l&apos;enregistrement.</span>
          <button
            type="button"
            onClick={onCancelRemove}
            className="text-[11px] text-slate-700 hover:underline"
          >
            Annuler
          </button>
        </div>
      )}
      <input
        type="file"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.txt,.csv"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
        className="text-xs"
      />
      {file && (
        <div className="text-[11px] text-slate-500 mt-1">
          Sélectionné : {file.name} ({fmtSize(file.size)})
        </div>
      )}
    </div>
  );
}
