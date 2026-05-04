"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createIssue,
  deleteIssue,
  updateIssue,
} from "@/lib/magazine/actions";
import type { Author, Issue } from "@/lib/magazine";

export default function IssueForm({
  mode,
  initial,
  authors,
}: {
  mode: "create" | "edit";
  initial?: Issue;
  authors: Author[];
}) {
  const router = useRouter();
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [number, setNumber] = useState<number>(initial?.number ?? 1);
  const [monthLabel, setMonthLabel] = useState(initial?.monthLabel ?? "");
  const [theme, setTheme] = useState(initial?.theme ?? "");
  const [blurb, setBlurb] = useState(initial?.blurb ?? "");
  const [editorial, setEditorial] = useState(initial?.editorial ?? "");
  const [editorId, setEditorId] = useState(initial?.editorId ?? "");
  const [coverFrom, setCoverFrom] = useState(initial?.coverGradient.from ?? "#1d4ed8");
  const [coverTo, setCoverTo] = useState(initial?.coverGradient.to ?? "#0c4a6e");
  const [coverText, setCoverText] = useState<"light" | "dark">(initial?.coverText ?? "light");
  const [publish, setPublish] = useState(!!initial?.publishedAt);

  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  function submit() {
    setFeedback(null);
    const fd = new FormData();
    fd.append("slug", slug.trim());
    fd.append("number", String(number));
    fd.append("month_label", monthLabel.trim());
    fd.append("theme", theme.trim());
    fd.append("blurb", blurb.trim());
    fd.append("editorial", editorial.trim());
    fd.append("editor_id", editorId);
    fd.append("cover_gradient_from", coverFrom);
    fd.append("cover_gradient_to", coverTo);
    fd.append("cover_text", coverText);
    if (publish) fd.append("publish", "1");

    startTransition(async () => {
      if (mode === "create") {
        const res = await createIssue(fd);
        if (res.ok) {
          router.push(`/admin/magazine/numeros/${res.data.id}`);
        } else {
          setFeedback({ ok: false, msg: res.error });
        }
      } else {
        const res = await updateIssue(initial!.id, fd);
        if (res.ok) {
          setFeedback({ ok: true, msg: "Enregistré." });
          router.refresh();
        } else {
          setFeedback({ ok: false, msg: res.error });
        }
      }
    });
  }

  function onDelete() {
    if (!initial) return;
    if (!confirm(`Supprimer le numéro « ${initial.theme} » ? Tous ses articles seront aussi supprimés.`)) return;
    startTransition(async () => {
      const res = await deleteIssue(initial.id);
      if (res.ok) router.push("/admin/magazine/numeros");
      else setFeedback({ ok: false, msg: res.error });
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

      <div className="grid grid-cols-1 md:grid-cols-[120px_1fr_220px] gap-3">
        <div>
          <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
            N°
          </label>
          <input
            type="number"
            min={1}
            value={number}
            onChange={(e) => setNumber(parseInt(e.target.value, 10) || 1)}
            className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 tabular-nums"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
            Slug (URL)
          </label>
          <input
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
            placeholder="07-juin-2026"
            className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 font-mono"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
            Mois
          </label>
          <input
            type="text"
            value={monthLabel}
            onChange={(e) => setMonthLabel(e.target.value)}
            placeholder="Juin 2026"
            className="w-full text-sm border border-slate-300 rounded px-2 py-1.5"
          />
        </div>
      </div>

      <div>
        <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
          Thème principal
        </label>
        <input
          type="text"
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
          placeholder="Le retour du dollar fort"
          className="w-full text-sm border border-slate-300 rounded px-2 py-1.5"
        />
      </div>

      <div>
        <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
          Accroche (1 phrase)
        </label>
        <textarea
          value={blurb}
          onChange={(e) => setBlurb(e.target.value)}
          rows={2}
          maxLength={400}
          className="w-full text-sm border border-slate-300 rounded px-2 py-1.5"
        />
      </div>

      <div>
        <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
          Éditorial (mot du rédacteur en chef)
        </label>
        <textarea
          value={editorial}
          onChange={(e) => setEditorial(e.target.value)}
          rows={5}
          className="w-full text-sm border border-slate-300 rounded px-2 py-1.5"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
            Rédacteur en chef
          </label>
          <select
            value={editorId ?? ""}
            onChange={(e) => setEditorId(e.target.value || "")}
            className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 bg-white"
          >
            <option value="">— Aucun signataire —</option>
            {authors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.title}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
            Couleur de texte couverture
          </label>
          <select
            value={coverText}
            onChange={(e) => setCoverText(e.target.value as "light" | "dark")}
            className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 bg-white"
          >
            <option value="light">Clair (sur fond foncé)</option>
            <option value="dark">Foncé (sur fond clair)</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-[11px] font-medium text-slate-700 uppercase mb-2">
          Couverture · gradient
        </label>
        <div className="flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-2 text-xs text-slate-700">
            De
            <input
              type="color"
              value={coverFrom}
              onChange={(e) => setCoverFrom(e.target.value)}
              className="w-10 h-8 border border-slate-300 rounded cursor-pointer"
            />
            <input
              type="text"
              value={coverFrom}
              onChange={(e) => setCoverFrom(e.target.value)}
              className="text-xs border border-slate-300 rounded px-1.5 py-1 w-24 font-mono"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-700">
            À
            <input
              type="color"
              value={coverTo}
              onChange={(e) => setCoverTo(e.target.value)}
              className="w-10 h-8 border border-slate-300 rounded cursor-pointer"
            />
            <input
              type="text"
              value={coverTo}
              onChange={(e) => setCoverTo(e.target.value)}
              className="text-xs border border-slate-300 rounded px-1.5 py-1 w-24 font-mono"
            />
          </label>
          <div
            className="rounded shadow-sm border border-slate-200 px-3 py-2 flex items-center justify-center text-xs font-semibold"
            style={{
              width: 110,
              height: 60,
              background: `linear-gradient(135deg, ${coverFrom}, ${coverTo})`,
              color: coverText === "light" ? "white" : "#0f172a",
            }}
          >
            N° {String(number).padStart(2, "0")}
          </div>
        </div>
      </div>

      <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={publish}
            onChange={(e) => setPublish(e.target.checked)}
            className="accent-slate-900"
          />
          Publier
        </label>
        <div className="flex items-center gap-2">
          {mode === "edit" && (
            <button
              onClick={onDelete}
              disabled={isPending}
              className="text-sm bg-rose-50 hover:bg-rose-100 text-rose-700 font-medium px-3 py-2 rounded border border-rose-200 disabled:opacity-50"
            >
              Supprimer
            </button>
          )}
          <button
            onClick={submit}
            disabled={isPending}
            className="text-sm bg-slate-900 hover:bg-slate-700 text-white font-medium px-4 py-2 rounded disabled:opacity-50"
          >
            {isPending ? "Enregistrement…" : mode === "create" ? "Créer" : "Mettre à jour"}
          </button>
        </div>
      </div>
    </div>
  );
}
