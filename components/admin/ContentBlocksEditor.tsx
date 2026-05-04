"use client";

import { useRef, useState, useTransition } from "react";
import type { ContentBlock, ImageWidth } from "@/lib/magazine";
import { uploadMagazineImage } from "@/lib/magazine/actions";

const BLOCK_TYPES: { type: ContentBlock["type"]; label: string }[] = [
  { type: "paragraph", label: "Paragraphe" },
  { type: "heading", label: "Titre" },
  { type: "quote", label: "Citation" },
  { type: "callout", label: "Encadré (callout)" },
  { type: "list", label: "Liste" },
  { type: "stats", label: "Stats (KPIs)" },
  { type: "image", label: "Image" },
  { type: "divider", label: "Séparateur" },
];

const IMAGE_WIDTHS: { value: ImageWidth; label: string }[] = [
  { value: "narrow", label: "Étroite (texte)" },
  { value: "wide", label: "Large (déborde)" },
  { value: "full", label: "Pleine largeur" },
];

const CALLOUT_TONES: ("info" | "warning" | "success" | "neutral")[] = [
  "info",
  "warning",
  "success",
  "neutral",
];

function makeBlock(type: ContentBlock["type"]): ContentBlock {
  switch (type) {
    case "paragraph":
      return { type: "paragraph", text: "" };
    case "heading":
      return { type: "heading", level: 2, text: "" };
    case "quote":
      return { type: "quote", text: "" };
    case "callout":
      return { type: "callout", tone: "info", text: "" };
    case "list":
      return { type: "list", items: [""] };
    case "stats":
      return { type: "stats", items: [{ label: "", value: "" }] };
    case "image":
      return { type: "image", src: "", alt: "", width: "wide" };
    case "divider":
      return { type: "divider" };
  }
}

export default function ContentBlocksEditor({
  value,
  onChange,
  articleSlug,
}: {
  value: ContentBlock[];
  onChange: (next: ContentBlock[]) => void;
  articleSlug?: string;
}) {
  function add(type: ContentBlock["type"]) {
    onChange([...value, makeBlock(type)]);
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
  function update(idx: number, patch: Partial<ContentBlock>) {
    onChange(
      value.map((b, i) => (i === idx ? ({ ...b, ...patch } as ContentBlock) : b)),
    );
  }

  return (
    <div className="space-y-3">
      {value.length === 0 && (
        <div className="text-xs text-slate-500 text-center py-6 border border-dashed border-slate-200 rounded">
          Aucun bloc. Ajoutez un premier bloc ci-dessous.
        </div>
      )}

      {value.map((block, i) => (
        <div
          key={i}
          className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
              {BLOCK_TYPES.find((t) => t.type === block.type)?.label ?? block.type}
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
            onUpdate={(patch) => update(i, patch)}
            articleSlug={articleSlug}
          />
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2 pt-2">
        <span className="text-[11px] text-slate-500 mr-1">Ajouter :</span>
        {BLOCK_TYPES.map((t) => (
          <button
            key={t.type}
            type="button"
            onClick={() => add(t.type)}
            className="text-[11px] px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 text-slate-700"
          >
            + {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function BlockBody({
  block,
  onUpdate,
  articleSlug,
}: {
  block: ContentBlock;
  onUpdate: (patch: Partial<ContentBlock>) => void;
  articleSlug?: string;
}) {
  if (block.type === "paragraph") {
    return (
      <div className="space-y-2">
        <textarea
          value={block.text}
          onChange={(e) => onUpdate({ text: e.target.value })}
          rows={3}
          placeholder="Texte du paragraphe…"
          className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 bg-white"
        />
        <label className="flex items-center gap-2 text-[11px] text-slate-700">
          <input
            type="checkbox"
            checked={!!block.lead}
            onChange={(e) => onUpdate({ lead: e.target.checked })}
            className="accent-slate-900"
          />
          Chapeau (lead) — affiché en plus gros, en intro
        </label>
      </div>
    );
  }

  if (block.type === "heading") {
    return (
      <div className="grid grid-cols-1 md:grid-cols-[100px_1fr_180px] gap-2">
        <select
          value={block.level}
          onChange={(e) => onUpdate({ level: parseInt(e.target.value, 10) as 2 | 3 })}
          className="text-sm border border-slate-300 rounded px-2 py-1.5 bg-white"
        >
          <option value={2}>H2</option>
          <option value={3}>H3</option>
        </select>
        <input
          type="text"
          value={block.text}
          onChange={(e) => onUpdate({ text: e.target.value })}
          placeholder="Titre de section"
          className="text-sm border border-slate-300 rounded px-2 py-1.5 bg-white"
        />
        <input
          type="text"
          value={block.id ?? ""}
          onChange={(e) => onUpdate({ id: e.target.value || undefined })}
          placeholder="ancre (optionnel)"
          className="text-sm border border-slate-300 rounded px-2 py-1.5 bg-white font-mono text-[11px]"
        />
      </div>
    );
  }

  if (block.type === "quote") {
    return (
      <div className="space-y-2">
        <textarea
          value={block.text}
          onChange={(e) => onUpdate({ text: e.target.value })}
          rows={3}
          placeholder="Texte de la citation…"
          className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 bg-white"
        />
        <input
          type="text"
          value={block.author ?? ""}
          onChange={(e) => onUpdate({ author: e.target.value || undefined })}
          placeholder="Auteur de la citation (optionnel)"
          className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 bg-white"
        />
      </div>
    );
  }

  if (block.type === "callout") {
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-2">
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
            placeholder="Titre du callout (optionnel)"
            className="text-sm border border-slate-300 rounded px-2 py-1.5 bg-white"
          />
        </div>
        <textarea
          value={block.text}
          onChange={(e) => onUpdate({ text: e.target.value })}
          rows={3}
          placeholder="Texte du callout…"
          className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 bg-white"
        />
      </div>
    );
  }

  if (block.type === "list") {
    return (
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-[11px] text-slate-700">
          <input
            type="checkbox"
            checked={!!block.ordered}
            onChange={(e) => onUpdate({ ordered: e.target.checked })}
            className="accent-slate-900"
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
              className="text-[11px] text-rose-700 hover:underline disabled:opacity-30"
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

  if (block.type === "stats") {
    return (
      <div className="space-y-2">
        {block.items.map((item, i) => (
          <div
            key={i}
            className="grid grid-cols-1 md:grid-cols-[1fr_140px_140px_100px_auto] gap-2 items-center"
          >
            <input
              type="text"
              value={item.label}
              onChange={(e) => {
                const items = [...block.items];
                items[i] = { ...item, label: e.target.value };
                onUpdate({ items });
              }}
              placeholder="Libellé (ex : USD/XOF · 1 an)"
              className="text-sm border border-slate-300 rounded px-2 py-1.5 bg-white"
            />
            <input
              type="text"
              value={item.value}
              onChange={(e) => {
                const items = [...block.items];
                items[i] = { ...item, value: e.target.value };
                onUpdate({ items });
              }}
              placeholder="Valeur (ex : +8,2 %)"
              className="text-sm border border-slate-300 rounded px-2 py-1.5 bg-white tabular-nums"
            />
            <input
              type="text"
              value={item.sub ?? ""}
              onChange={(e) => {
                const items = [...block.items];
                items[i] = { ...item, sub: e.target.value || undefined };
                onUpdate({ items });
              }}
              placeholder="Sous-titre"
              className="text-sm border border-slate-300 rounded px-2 py-1.5 bg-white"
            />
            <input
              type="color"
              value={item.accent ?? "#475569"}
              onChange={(e) => {
                const items = [...block.items];
                items[i] = { ...item, accent: e.target.value };
                onUpdate({ items });
              }}
              className="w-full h-8 border border-slate-300 rounded cursor-pointer"
              title="Couleur accent"
            />
            <button
              type="button"
              onClick={() => {
                const items = block.items.filter((_, j) => j !== i);
                onUpdate({ items: items.length > 0 ? items : [{ label: "", value: "" }] });
              }}
              disabled={block.items.length === 1}
              className="text-[11px] text-rose-700 hover:underline disabled:opacity-30"
            >
              Suppr.
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            onUpdate({ items: [...block.items, { label: "", value: "" }] })
          }
          className="text-[11px] px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100"
        >
          + Stat
        </button>
      </div>
    );
  }

  if (block.type === "image") {
    return (
      <ImageBlockBody block={block} onUpdate={onUpdate} articleSlug={articleSlug} />
    );
  }

  // divider
  return (
    <div className="text-[11px] text-slate-500 italic">
      Séparateur — pas de configuration nécessaire.
    </div>
  );
}

function ImageBlockBody({
  block,
  onUpdate,
  articleSlug,
}: {
  block: Extract<ContentBlock, { type: "image" }>;
  onUpdate: (patch: Partial<ContentBlock>) => void;
  articleSlug?: string;
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
    if (articleSlug) fd.append("article_slug", articleSlug);
    startTransition(async () => {
      const res = await uploadMagazineImage(fd);
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
            className="w-full max-h-64 object-contain bg-slate-100"
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
          className="w-full text-sm border-2 border-dashed border-slate-300 rounded-lg px-3 py-6 bg-white hover:bg-slate-100 text-slate-600 disabled:opacity-50"
        >
          {isPending ? "Téléversement…" : "📷 Téléverser une image (JPG, PNG, WebP, max 5 Mo)"}
        </button>
      )}

      {error && (
        <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[1fr_180px] gap-2">
        <input
          type="text"
          value={block.src}
          onChange={(e) => onUpdate({ src: e.target.value })}
          placeholder="URL de l'image (ou téléverser ci-dessus)"
          className="text-sm border border-slate-300 rounded px-2 py-1.5 bg-white font-mono text-[11px]"
        />
        <select
          value={block.width ?? "wide"}
          onChange={(e) => onUpdate({ width: e.target.value as ImageWidth })}
          className="text-sm border border-slate-300 rounded px-2 py-1.5 bg-white"
        >
          {IMAGE_WIDTHS.map((w) => (
            <option key={w.value} value={w.value}>
              {w.label}
            </option>
          ))}
        </select>
      </div>

      <input
        type="text"
        value={block.alt}
        onChange={(e) => onUpdate({ alt: e.target.value })}
        placeholder="Texte alternatif (alt) — décrit l'image, important pour l'accessibilité"
        className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 bg-white"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <input
          type="text"
          value={block.caption ?? ""}
          onChange={(e) => onUpdate({ caption: e.target.value || undefined })}
          placeholder="Légende (optionnelle)"
          className="text-sm border border-slate-300 rounded px-2 py-1.5 bg-white"
        />
        <input
          type="text"
          value={block.credit ?? ""}
          onChange={(e) => onUpdate({ credit: e.target.value || undefined })}
          placeholder="Crédit (ex : © BCEAO)"
          className="text-sm border border-slate-300 rounded px-2 py-1.5 bg-white"
        />
      </div>
    </div>
  );
}
