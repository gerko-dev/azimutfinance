"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteAuthor, upsertAuthor } from "@/lib/magazine/actions";
import type { Author } from "@/lib/magazine";
import type { AdminMember } from "@/lib/admin/types";

export default function AuthorForm({
  mode,
  initial,
  admins,
  onSaved,
}: {
  mode: "create" | "edit";
  initial?: Author;
  admins: AdminMember[];
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [userId, setUserId] = useState(initial?.userId ?? "");
  const [displayName, setDisplayName] = useState(initial?.name ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [bio, setBio] = useState(initial?.bio ?? "");
  const [initials, setInitials] = useState(initial?.initials ?? "");

  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  function submit() {
    setFeedback(null);
    const fd = new FormData();
    if (initial) fd.append("id", initial.id);
    fd.append("slug", slug.trim());
    fd.append("user_id", userId);
    fd.append("display_name", displayName.trim());
    fd.append("title", title.trim());
    fd.append("bio", bio.trim());
    fd.append("initials", initials.trim().toUpperCase());

    startTransition(async () => {
      const res = await upsertAuthor(fd);
      if (res.ok) {
        setFeedback({ ok: true, msg: "Enregistré." });
        if (onSaved) onSaved();
        router.refresh();
      } else {
        setFeedback({ ok: false, msg: res.error });
      }
    });
  }

  function onDelete() {
    if (!initial) return;
    if (!confirm(`Supprimer l'auteur « ${initial.name} » ? Les articles signés deviendront non signés.`)) return;
    startTransition(async () => {
      const res = await deleteAuthor(initial.id);
      if (res.ok) router.refresh();
      else setFeedback({ ok: false, msg: res.error });
    });
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
            Slug
          </label>
          <input
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
            placeholder="kokou-segla"
            className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 font-mono"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
            Lié à un compte admin (optionnel)
          </label>
          <select
            value={userId ?? ""}
            onChange={(e) => setUserId(e.target.value)}
            className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 bg-white"
          >
            <option value="">— Aucun (auteur autonome) —</option>
            {admins.map((a) => (
              <option key={a.id} value={a.id}>
                {a.full_name ?? a.email ?? a.id} ({a.role})
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_140px_120px] gap-3">
        <div>
          <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
            Nom affiché
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Kokou Segla"
            className="w-full text-sm border border-slate-300 rounded px-2 py-1.5"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
            Initiales
          </label>
          <input
            type="text"
            value={initials}
            onChange={(e) => setInitials(e.target.value.toUpperCase())}
            placeholder="KS"
            maxLength={4}
            className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 font-mono uppercase tracking-wide"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
            Aperçu
          </label>
          <div className="h-9 flex items-center justify-center rounded bg-slate-900 text-white font-semibold text-sm">
            {initials || "??"}
          </div>
        </div>
      </div>

      <div>
        <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
          Titre / fonction
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Rédacteur en chef"
          className="w-full text-sm border border-slate-300 rounded px-2 py-1.5"
        />
      </div>

      <div>
        <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
          Biographie courte
        </label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={3}
          className="w-full text-sm border border-slate-300 rounded px-2 py-1.5"
        />
      </div>

      <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
        {mode === "edit" && (
          <button
            onClick={onDelete}
            disabled={isPending}
            className="text-sm bg-rose-50 hover:bg-rose-100 text-rose-700 font-medium px-3 py-1.5 rounded border border-rose-200 disabled:opacity-50"
          >
            Supprimer
          </button>
        )}
        <button
          onClick={submit}
          disabled={isPending}
          className="text-sm bg-slate-900 hover:bg-slate-700 text-white font-medium px-4 py-1.5 rounded disabled:opacity-50"
        >
          {isPending ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}
