"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ForumCategory } from "@/lib/forum/types";
import { createTopicAction } from "@/lib/forum/actions";

export default function NewTopicForm({
  categories,
  defaultCategorySlug,
}: {
  categories: ForumCategory[];
  defaultCategorySlug: string | null;
}) {
  const router = useRouter();
  const [categorySlug, setCategorySlug] = useState<string>(
    defaultCategorySlug && categories.some((c) => c.slug === defaultCategorySlug)
      ? defaultCategorySlug
      : categories[0]?.slug ?? "",
  );
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tickers, setTickers] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!categorySlug) {
      setError("Catégorie requise.");
      return;
    }
    if (title.trim().length < 5) {
      setError("Le titre doit faire au moins 5 caractères.");
      return;
    }
    if (body.trim().length < 10) {
      setError("Le message doit faire au moins 10 caractères.");
      return;
    }

    startTransition(async () => {
      const fd = new FormData();
      fd.set("category_slug", categorySlug);
      fd.set("title", title.trim());
      fd.set("body", body.trim());
      if (tickers.trim()) fd.set("tickers", tickers.trim());

      const res = await createTopicAction(fd);
      if (res.ok) {
        router.push(`/communaute/forum/t/${res.data.topicId}`);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <form
      onSubmit={submit}
      className="bg-white border border-slate-200 rounded-lg p-5 md:p-6 space-y-5"
    >
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1.5">
          Catégorie <span className="text-rose-600">*</span>
        </label>
        <select
          value={categorySlug}
          onChange={(e) => setCategorySlug(e.target.value)}
          className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
        >
          {categories.map((c) => (
            <option key={c.id} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1.5">
          Titre <span className="text-rose-600">*</span>
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          placeholder="Posez votre question en une phrase claire"
          className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
        />
        <div className="text-[11px] text-slate-400 mt-1 tabular-nums">
          {title.length} / 200
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1.5">
          Message <span className="text-rose-600">*</span>
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={8}
          maxLength={10000}
          placeholder="Donnez du contexte, des chiffres, votre raisonnement…"
          className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 resize-y"
        />
        <div className="text-[11px] text-slate-400 mt-1 tabular-nums">
          {body.length} / 10 000
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1.5">
          Tickers concernés (optionnel)
        </label>
        <input
          type="text"
          value={tickers}
          onChange={(e) => setTickers(e.target.value)}
          placeholder="SNTS, BRVMC, ORAC…"
          className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
        />
        <p className="text-[11px] text-slate-500 mt-1">
          Séparez par des virgules ou espaces. Si vous laissez vide, on
          détecte automatiquement les codes en majuscules dans votre message.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={() => router.push("/communaute/forum")}
          disabled={pending}
          className="px-4 py-2 rounded-md text-sm bg-white text-slate-700 border border-slate-300 hover:bg-slate-50"
        >
          Annuler
        </button>
        <button
          type="submit"
          disabled={pending}
          className="px-5 py-2 rounded-md bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800 disabled:opacity-60"
        >
          {pending ? "Publication…" : "Publier la discussion"}
        </button>
      </div>
    </form>
  );
}
