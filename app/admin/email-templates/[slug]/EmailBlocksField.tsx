"use client";

import { useRef, useState, useTransition } from "react";
import type { EmailBlock } from "@/lib/email/blocks";
import {
  EMAIL_BLOCK_LABELS,
  EMAIL_BLOCK_TYPES,
  makeEmailBlock,
} from "@/lib/email/blocks";
import { uploadEmailImageAction } from "../actions";

const CALLOUT_TONES: ("info" | "warning" | "success" | "neutral")[] = [
  "info",
  "warning",
  "success",
  "neutral",
];

const SPACER_SIZES: ("sm" | "md" | "lg")[] = ["sm", "md", "lg"];

const IMAGE_WIDTHS: ("narrow" | "wide" | "full")[] = ["narrow", "wide", "full"];

type Props = {
  slug: string;
  value: EmailBlock[];
  onChange: (next: EmailBlock[]) => void;
};

export default function EmailBlocksField({ slug, value, onChange }: Props) {
  function add(type: EmailBlock["type"]) {
    onChange([...value, makeEmailBlock(type)]);
  }
  function remove(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }
  function move(idx: number, dir: -1 | 1) {
    const next = [...value];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next);
  }
  function update(idx: number, patch: Partial<EmailBlock>) {
    onChange(value.map((b, i) => (i === idx ? ({ ...b, ...patch } as EmailBlock) : b)));
  }

  return (
    <div className="space-y-2.5">
      {value.length === 0 && (
        <div className="text-xs text-slate-500 text-center py-6 border border-dashed border-slate-200 rounded">
          Aucun bloc. Ajoute un premier bloc ci-dessous.
        </div>
      )}

      {value.map((block, i) => (
        <div
          key={i}
          className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">
              {EMAIL_BLOCK_LABELS[block.type]}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                className="text-[11px] text-slate-500 hover:text-slate-900 disabled:opacity-30 px-1"
                title="Monter"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === value.length - 1}
                className="text-[11px] text-slate-500 hover:text-slate-900 disabled:opacity-30 px-1"
                title="Descendre"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => remove(i)}
                className="text-[11px] text-rose-700 hover:underline ml-2"
              >
                Suppr.
              </button>
            </div>
          </div>

          <BlockBody
            block={block}
            slug={slug}
            onUpdate={(patch) => update(i, patch)}
          />
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-200">
        <span className="text-[11px] text-slate-500 mr-1">Ajouter :</span>
        {EMAIL_BLOCK_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => add(t)}
            className="text-[11px] px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 text-slate-700"
          >
            + {EMAIL_BLOCK_LABELS[t]}
          </button>
        ))}
      </div>
    </div>
  );
}

function BlockBody({
  block,
  slug,
  onUpdate,
}: {
  block: EmailBlock;
  slug: string;
  onUpdate: (patch: Partial<EmailBlock>) => void;
}) {
  if (block.type === "paragraph") {
    return (
      <div className="space-y-2">
        <textarea
          value={block.text}
          onChange={(e) => onUpdate({ text: e.target.value })}
          rows={3}
          placeholder="Texte du paragraphe… (utilise {{full_name}}, {{amount}}, etc.)"
          className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 bg-white"
        />
        <label className="flex items-center gap-2 text-[11px] text-slate-700">
          <input
            type="checkbox"
            checked={!!block.lead}
            onChange={(e) => onUpdate({ lead: e.target.checked })}
          />
          Mettre en avant (intro, taille un peu plus grande)
        </label>
      </div>
    );
  }

  if (block.type === "heading") {
    return (
      <div className="grid grid-cols-[80px_1fr] gap-2">
        <select
          value={block.level}
          onChange={(e) => onUpdate({ level: parseInt(e.target.value, 10) as 1 | 2 | 3 })}
          className="text-sm border border-slate-300 rounded px-2 py-1.5 bg-white"
        >
          <option value={1}>H1</option>
          <option value={2}>H2</option>
          <option value={3}>H3</option>
        </select>
        <input
          type="text"
          value={block.text}
          onChange={(e) => onUpdate({ text: e.target.value })}
          placeholder="Titre"
          className="text-sm border border-slate-300 rounded px-2 py-1.5 bg-white"
        />
      </div>
    );
  }

  if (block.type === "image") {
    return <ImageBlockBody block={block} slug={slug} onUpdate={onUpdate} />;
  }

  if (block.type === "button") {
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <input
            type="text"
            value={block.text}
            onChange={(e) => onUpdate({ text: e.target.value })}
            placeholder="Texte du bouton (ex. Accéder à mon compte)"
            className="text-sm border border-slate-300 rounded px-2 py-1.5 bg-white"
          />
          <input
            type="text"
            value={block.url}
            onChange={(e) => onUpdate({ url: e.target.value })}
            placeholder="URL ou {{account_url}}"
            className="text-sm border border-slate-300 rounded px-2 py-1.5 bg-white font-mono text-[11px]"
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={block.color ?? "#1d4ed8"}
            onChange={(e) => onUpdate({ color: e.target.value })}
            className="w-12 h-8 border border-slate-300 rounded cursor-pointer"
          />
          <span className="text-[11px] text-slate-600">
            Couleur du bouton{" "}
            <button
              type="button"
              onClick={() => onUpdate({ color: undefined })}
              className="text-blue-700 hover:underline ml-1"
            >
              utiliser couleur d&apos;accent
            </button>
          </span>
        </div>
      </div>
    );
  }

  if (block.type === "list") {
    return (
      <div className="space-y-1.5">
        <label className="flex items-center gap-2 text-[11px] text-slate-700">
          <input
            type="checkbox"
            checked={!!block.ordered}
            onChange={(e) => onUpdate({ ordered: e.target.checked })}
          />
          Liste numérotée
        </label>
        {block.items.map((item, i) => (
          <div key={i} className="flex gap-2">
            <input
              type="text"
              value={item}
              onChange={(e) => {
                const items = [...block.items];
                items[i] = e.target.value;
                onUpdate({ items });
              }}
              placeholder={`Élément ${i + 1}`}
              className="flex-1 text-sm border border-slate-300 rounded px-2 py-1.5 bg-white"
            />
            <button
              type="button"
              onClick={() => {
                const items = block.items.filter((_, j) => j !== i);
                onUpdate({ items: items.length > 0 ? items : [""] });
              }}
              disabled={block.items.length === 1}
              className="text-[11px] text-rose-700 hover:underline disabled:opacity-30 px-2"
            >
              Suppr.
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onUpdate({ items: [...block.items, ""] })}
          className="text-[11px] px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100"
        >
          + Élément
        </button>
      </div>
    );
  }

  if (block.type === "callout") {
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-1 md:grid-cols-[140px_1fr] gap-2">
          <select
            value={block.tone}
            onChange={(e) => onUpdate({ tone: e.target.value as typeof block.tone })}
            className="text-sm border border-slate-300 rounded px-2 py-1.5 bg-white"
          >
            {CALLOUT_TONES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={block.title ?? ""}
            onChange={(e) => onUpdate({ title: e.target.value || undefined })}
            placeholder="Titre (optionnel)"
            className="text-sm border border-slate-300 rounded px-2 py-1.5 bg-white"
          />
        </div>
        <textarea
          value={block.text}
          onChange={(e) => onUpdate({ text: e.target.value })}
          rows={3}
          placeholder="Contenu de l'encadré"
          className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 bg-white"
        />
      </div>
    );
  }

  if (block.type === "divider") {
    return (
      <div className="text-[11px] text-slate-500 italic">
        Séparateur horizontal — pas de configuration.
      </div>
    );
  }

  if (block.type === "spacer") {
    return (
      <div className="flex items-center gap-2 text-[11px] text-slate-700">
        Taille :
        <select
          value={block.size ?? "md"}
          onChange={(e) => onUpdate({ size: e.target.value as "sm" | "md" | "lg" })}
          className="text-sm border border-slate-300 rounded px-2 py-1 bg-white"
        >
          {SPACER_SIZES.map((s) => (
            <option key={s} value={s}>
              {s === "sm" ? "Petit" : s === "md" ? "Moyen" : "Grand"}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return null;
}

function ImageBlockBody({
  block,
  slug,
  onUpdate,
}: {
  block: Extract<EmailBlock, { type: "image" }>;
  slug: string;
  onUpdate: (patch: Partial<EmailBlock>) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function pickFile() {
    fileInputRef.current?.click();
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("slug", slug);
    startTransition(async () => {
      const res = await uploadEmailImageAction(fd);
      if (res.ok) {
        onUpdate({ src: res.data.url });
      } else {
        setError(res.error);
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    });
  }

  return (
    <div className="space-y-2">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
        onChange={onFileChange}
        className="hidden"
      />

      {block.src ? (
        <div className="relative group rounded border border-slate-200 bg-white overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={block.src}
            alt={block.alt || "Aperçu"}
            className="w-full max-h-48 object-contain bg-slate-100"
          />
          <button
            type="button"
            onClick={() => onUpdate({ src: "" })}
            className="absolute top-1.5 right-1.5 text-[10px] bg-white/90 hover:bg-white text-rose-700 font-medium px-2 py-0.5 rounded border border-rose-200"
          >
            Retirer
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={pickFile}
          disabled={isPending}
          className="w-full text-sm border-2 border-dashed border-slate-300 rounded-lg px-3 py-5 bg-white hover:bg-slate-100 text-slate-600 disabled:opacity-50"
        >
          {isPending ? "Téléversement…" : "📷 Téléverser une image (JPG, PNG, WebP, max 5 Mo)"}
        </button>
      )}

      {error && (
        <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[1fr_140px] gap-2">
        <input
          type="text"
          value={block.alt}
          onChange={(e) => onUpdate({ alt: e.target.value })}
          placeholder="Texte alternatif (alt) — décrit l'image"
          className="text-sm border border-slate-300 rounded px-2 py-1.5 bg-white"
        />
        <select
          value={block.width ?? "wide"}
          onChange={(e) => onUpdate({ width: e.target.value as "narrow" | "wide" | "full" })}
          className="text-sm border border-slate-300 rounded px-2 py-1.5 bg-white"
        >
          {IMAGE_WIDTHS.map((w) => (
            <option key={w} value={w}>
              {w === "narrow" ? "Étroite" : w === "wide" ? "Large (défaut)" : "Pleine largeur"}
            </option>
          ))}
        </select>
      </div>

      <input
        type="text"
        value={block.caption ?? ""}
        onChange={(e) => onUpdate({ caption: e.target.value || undefined })}
        placeholder="Légende (optionnelle)"
        className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 bg-white"
      />
    </div>
  );
}
