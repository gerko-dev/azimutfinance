"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createFormation,
  deleteFormation,
  updateFormation,
} from "@/lib/formations/actions";
import {
  CATEGORY_META,
  type Formation,
  type FormationCategory,
  type FormationFormat,
  type FormationLevel,
  type FormationModule,
  type FormationPricingType,
} from "@/lib/formations";

const LEVELS: { id: FormationLevel; label: string }[] = [
  { id: "debutant", label: "Débutant" },
  { id: "intermediaire", label: "Intermédiaire" },
  { id: "avance", label: "Avancé" },
];
const FORMATS: { id: FormationFormat; label: string }[] = [
  { id: "cours", label: "Cours en ligne" },
  { id: "atelier", label: "Atelier live" },
  { id: "certifiant", label: "Certifiant" },
];
const PRICINGS: { id: FormationPricingType; label: string }[] = [
  { id: "gratuit", label: "Gratuit" },
  { id: "premium", label: "Premium (payant)" },
  { id: "certifiant", label: "Certifiant (parcours payant)" },
];

export default function FormationForm({
  mode,
  initial,
}: {
  mode: "create" | "edit";
  initial?: Formation;
}) {
  const router = useRouter();
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [shortDescription, setShortDescription] = useState(initial?.shortDescription ?? "");
  const [longDescription, setLongDescription] = useState(initial?.longDescription ?? "");
  const [level, setLevel] = useState<FormationLevel>(initial?.level ?? "debutant");
  const [format, setFormat] = useState<FormationFormat>(initial?.format ?? "cours");
  const [category, setCategory] = useState<FormationCategory>(initial?.category ?? "bourse");
  const [pricingType, setPricingType] = useState<FormationPricingType>(
    initial?.pricing.type ?? "gratuit",
  );
  const [priceFcfa, setPriceFcfa] = useState<number>(
    initial?.pricing.type === "gratuit" ? 0 : initial?.pricing.priceFcfa ?? 0,
  );
  const [tags, setTags] = useState(initial?.tags.join(", ") ?? "");
  const [prerequisites, setPrerequisites] = useState(
    initial?.prerequisites.join("\n") ?? "",
  );
  const [outcomes, setOutcomes] = useState(initial?.outcomes.join("\n") ?? "");
  const [instructorName, setInstructorName] = useState(initial?.instructor?.name ?? "");
  const [instructorTitle, setInstructorTitle] = useState(initial?.instructor?.title ?? "");
  const [featured, setFeatured] = useState(initial?.featured ?? false);
  const [publish, setPublish] = useState(!!initial?.publishedAt);
  const [modules, setModules] = useState<FormationModule[]>(
    initial?.modules ?? [{ title: "", durationMinutes: 30 }],
  );
  const [registrationDeadline, setRegistrationDeadline] = useState(
    initial?.registrationDeadline?.slice(0, 10) ?? "",
  );
  const [startsAt, setStartsAt] = useState(initial?.startsAt?.slice(0, 10) ?? "");
  const [endsAt, setEndsAt] = useState(initial?.endsAt?.slice(0, 10) ?? "");

  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  function addModule() {
    setModules([...modules, { title: "", durationMinutes: 30 }]);
  }
  function removeModule(idx: number) {
    setModules(modules.filter((_, i) => i !== idx));
  }
  function updateModule(idx: number, patch: Partial<FormationModule>) {
    setModules(modules.map((m, i) => (i === idx ? { ...m, ...patch } : m)));
  }
  function moveModule(idx: number, dir: -1 | 1) {
    const next = [...modules];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setModules(next);
  }

  function submit() {
    setFeedback(null);
    const fd = new FormData();
    fd.append("slug", slug.trim());
    fd.append("title", title.trim());
    fd.append("shortDescription", shortDescription.trim());
    fd.append("longDescription", longDescription.trim());
    fd.append("level", level);
    fd.append("format", format);
    fd.append("category", category);
    fd.append("pricingType", pricingType);
    fd.append("priceFcfa", String(pricingType === "gratuit" ? 0 : priceFcfa));
    fd.append("tags", tags);
    fd.append("prerequisites", prerequisites);
    fd.append("outcomes", outcomes);
    fd.append("instructorName", instructorName.trim());
    fd.append("instructorTitle", instructorTitle.trim());
    if (featured) fd.append("featured", "1");
    if (publish) fd.append("publish", "1");
    fd.append("registrationDeadline", registrationDeadline);
    fd.append("startsAt", startsAt);
    fd.append("endsAt", endsAt);
    for (const m of modules) {
      fd.append("module_title", m.title);
      fd.append("module_duration", String(m.durationMinutes));
      fd.append("module_preview", m.preview ? "1" : "0");
    }

    startTransition(async () => {
      if (mode === "create") {
        const res = await createFormation(fd);
        if (res.ok) {
          setFeedback({ ok: true, msg: "Enregistré." });
          router.push(`/admin/formations/${res.data.id}`);
        } else {
          setFeedback({ ok: false, msg: res.error });
        }
      } else {
        const res = await updateFormation(initial!.id, fd);
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
    if (!confirm(`Supprimer définitivement « ${initial.title} » ? Cette action est irréversible.`)) {
      return;
    }
    startTransition(async () => {
      const res = await deleteFormation(initial.id);
      if (res.ok) {
        router.push("/admin/formations");
      } else {
        setFeedback({ ok: false, msg: res.error });
      }
    });
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-5">
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

      {/* Slug + Titre */}
      <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4">
        <div>
          <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
            Slug (URL)
          </label>
          <input
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
            placeholder="initiation-brvm"
            maxLength={120}
            className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 font-mono"
          />
          <div className="text-[10px] text-slate-400 mt-1">
            Lettres minuscules, chiffres, tirets uniquement.
          </div>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
            Titre
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Initiation à la BRVM"
            maxLength={200}
            className="w-full text-sm border border-slate-300 rounded px-2 py-1.5"
          />
        </div>
      </div>

      <div>
        <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
          Description courte (≤ 200 car.)
        </label>
        <textarea
          value={shortDescription}
          onChange={(e) => setShortDescription(e.target.value)}
          rows={2}
          maxLength={300}
          className="w-full text-sm border border-slate-300 rounded px-2 py-1.5"
        />
      </div>

      <div>
        <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
          Description longue (page détail)
        </label>
        <textarea
          value={longDescription}
          onChange={(e) => setLongDescription(e.target.value)}
          rows={5}
          className="w-full text-sm border border-slate-300 rounded px-2 py-1.5"
        />
      </div>

      {/* Catégorie / niveau / format */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
            Catégorie
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as FormationCategory)}
            className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 bg-white"
          >
            {(Object.keys(CATEGORY_META) as FormationCategory[]).map((c) => (
              <option key={c} value={c}>
                {CATEGORY_META[c].label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
            Niveau
          </label>
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value as FormationLevel)}
            className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 bg-white"
          >
            {LEVELS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
            Format
          </label>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as FormationFormat)}
            className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 bg-white"
          >
            {FORMATS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Tarification */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-4">
        <div>
          <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
            Tarification
          </label>
          <select
            value={pricingType}
            onChange={(e) => {
              const v = e.target.value as FormationPricingType;
              setPricingType(v);
              if (v === "gratuit") setPriceFcfa(0);
            }}
            className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 bg-white"
          >
            {PRICINGS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
            Prix FCFA
          </label>
          <input
            type="number"
            min={0}
            step={1000}
            disabled={pricingType === "gratuit"}
            value={priceFcfa}
            onChange={(e) => setPriceFcfa(parseInt(e.target.value, 10) || 0)}
            className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 tabular-nums disabled:bg-slate-100"
          />
        </div>
      </div>

      {/* Modules */}
      <div className="border border-slate-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Modules</h3>
            <p className="text-[11px] text-slate-500">
              Ordonnez les modules. Cochez « Aperçu » pour les rendre accessibles gratuitement.
            </p>
          </div>
          <button
            type="button"
            onClick={addModule}
            className="text-xs bg-slate-900 hover:bg-slate-700 text-white px-2.5 py-1 rounded"
          >
            + Ajouter un module
          </button>
        </div>
        <div className="space-y-2">
          {modules.map((m, i) => (
            <div
              key={i}
              className="grid grid-cols-[40px_1fr_120px_90px_auto] gap-2 items-center bg-slate-50 border border-slate-200 rounded px-2 py-1.5"
            >
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => moveModule(i, -1)}
                  disabled={i === 0}
                  className="text-[11px] text-slate-500 hover:text-slate-900 disabled:opacity-30"
                  title="Monter"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moveModule(i, 1)}
                  disabled={i === modules.length - 1}
                  className="text-[11px] text-slate-500 hover:text-slate-900 disabled:opacity-30"
                  title="Descendre"
                >
                  ↓
                </button>
              </div>
              <input
                type="text"
                value={m.title}
                onChange={(e) => updateModule(i, { title: e.target.value })}
                placeholder={`Module ${i + 1}`}
                className="text-sm border border-slate-300 rounded px-2 py-1"
              />
              <input
                type="number"
                min={1}
                step={5}
                value={m.durationMinutes}
                onChange={(e) =>
                  updateModule(i, { durationMinutes: parseInt(e.target.value, 10) || 0 })
                }
                placeholder="min"
                className="text-sm border border-slate-300 rounded px-2 py-1 tabular-nums"
              />
              <label className="text-[11px] flex items-center gap-1 justify-center">
                <input
                  type="checkbox"
                  checked={!!m.preview}
                  onChange={(e) => updateModule(i, { preview: e.target.checked })}
                  className="accent-slate-900"
                />
                Aperçu
              </label>
              <button
                type="button"
                onClick={() => removeModule(i)}
                disabled={modules.length === 1}
                className="text-[11px] text-rose-700 hover:underline disabled:opacity-30 disabled:no-underline"
              >
                Suppr.
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Session : dates */}
      <div className="border border-slate-200 rounded-lg p-4">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-slate-900">Session</h3>
          <p className="text-[11px] text-slate-500">
            Dates optionnelles (pour les ateliers/certifiants avec session datée).
            Laisser vide pour un cours toujours accessible.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
              Date limite d&apos;inscription
            </label>
            <input
              type="date"
              value={registrationDeadline}
              onChange={(e) => setRegistrationDeadline(e.target.value)}
              className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 tabular-nums"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
              Date de début
            </label>
            <input
              type="date"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 tabular-nums"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
              Date de fin
            </label>
            <input
              type="date"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 tabular-nums"
            />
          </div>
        </div>
      </div>

      {/* Outcomes / prerequisites */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
            Objectifs (un par ligne)
          </label>
          <textarea
            value={outcomes}
            onChange={(e) => setOutcomes(e.target.value)}
            rows={5}
            placeholder={"Décrire le fonctionnement de la BRVM\nIdentifier les acteurs clés"}
            className="w-full text-sm border border-slate-300 rounded px-2 py-1.5"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
            Prérequis (un par ligne)
          </label>
          <textarea
            value={prerequisites}
            onChange={(e) => setPrerequisites(e.target.value)}
            rows={5}
            placeholder="Aucun prérequis financier"
            className="w-full text-sm border border-slate-300 rounded px-2 py-1.5"
          />
        </div>
      </div>

      {/* Instructeur + tags */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
            Animation (nom + titre, optionnel)
          </label>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={instructorName}
              onChange={(e) => setInstructorName(e.target.value)}
              placeholder="AzimutFinance"
              className="text-sm border border-slate-300 rounded px-2 py-1.5"
            />
            <input
              type="text"
              value={instructorTitle}
              onChange={(e) => setInstructorTitle(e.target.value)}
              placeholder="Équipe pédagogique"
              className="text-sm border border-slate-300 rounded px-2 py-1.5"
            />
          </div>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
            Tags (séparés par des virgules)
          </label>
          <input
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="BRVM, actions, débutant"
            className="w-full text-sm border border-slate-300 rounded px-2 py-1.5"
          />
        </div>
      </div>

      {/* Footer : publish + featured + actions */}
      <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4 flex-wrap">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={publish}
              onChange={(e) => setPublish(e.target.checked)}
              className="accent-slate-900"
            />
            Publier
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={featured}
              onChange={(e) => setFeatured(e.target.checked)}
              className="accent-slate-900"
            />
            Mise en avant ★
          </label>
        </div>
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
