"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createArticle,
  deleteArticle,
  updateArticle,
} from "@/lib/magazine/actions";
import {
  ARTICLE_CATEGORY_META,
  type Article,
  type ArticleCategory,
  type Author,
  type ContentBlock,
  type Issue,
} from "@/lib/magazine";
import ContentBlocksEditor from "./ContentBlocksEditor";

const CATEGORIES: ArticleCategory[] = [
  "macro", "marches", "obligations", "valeurs", "interview", "outils", "edito",
];

export default function ArticleForm({
  mode,
  initial,
  issues,
  authors,
  defaultIssueId,
}: {
  mode: "create" | "edit";
  initial?: Article;
  issues: Issue[];
  authors: Author[];
  defaultIssueId?: string;
}) {
  const router = useRouter();
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [issueId, setIssueId] = useState(initial?.issueId ?? defaultIssueId ?? (issues[0]?.id ?? ""));
  const [category, setCategory] = useState<ArticleCategory>(initial?.category ?? "marches");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [dek, setDek] = useState(initial?.dek ?? "");
  const [excerpt, setExcerpt] = useState(initial?.excerpt ?? "");
  const [tags, setTags] = useState(initial?.tags.join(", ") ?? "");
  const [authorId, setAuthorId] = useState(initial?.authorId ?? "");
  const [readingTimeMinutes, setReadingTimeMinutes] = useState(initial?.readingTimeMinutes ?? 6);
  const [accent, setAccent] = useState(initial?.accent ?? ARTICLE_CATEGORY_META["marches"].color);
  const [featured, setFeatured] = useState(initial?.featured ?? false);
  const [publish, setPublish] = useState(!!initial?.publishedAt);
  const [body, setBody] = useState<ContentBlock[]>(
    initial?.body && initial.body.length > 0
      ? initial.body
      : [{ type: "paragraph", text: "" }],
  );

  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  function submit() {
    setFeedback(null);
    const fd = new FormData();
    fd.append("slug", slug.trim());
    fd.append("issue_id", issueId);
    fd.append("category", category);
    fd.append("title", title.trim());
    fd.append("dek", dek.trim());
    fd.append("excerpt", excerpt.trim());
    fd.append("tags", tags);
    fd.append("author_id", authorId);
    fd.append("reading_time_minutes", String(readingTimeMinutes));
    fd.append("accent", accent);
    if (featured) fd.append("featured", "1");
    if (publish) fd.append("publish", "1");
    fd.append("body_json", JSON.stringify(body));

    startTransition(async () => {
      if (mode === "create") {
        const res = await createArticle(fd);
        if (res.ok) router.push(`/admin/magazine/articles/${res.data.id}`);
        else setFeedback({ ok: false, msg: res.error });
      } else {
        const res = await updateArticle(initial!.id, fd);
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
    if (!confirm(`Supprimer l'article « ${initial.title} » ?`)) return;
    startTransition(async () => {
      const res = await deleteArticle(initial.id);
      if (res.ok) router.push("/admin/magazine/articles");
      else setFeedback({ ok: false, msg: res.error });
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

      <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-3">
        <div>
          <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
            Slug (URL)
          </label>
          <input
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
            placeholder="dollar-fort-uemoa"
            className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 font-mono"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
            Numéro
          </label>
          <select
            value={issueId}
            onChange={(e) => setIssueId(e.target.value)}
            className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 bg-white"
          >
            {issues.length === 0 && (
              <option value="">— Aucun numéro disponible —</option>
            )}
            {issues.map((i) => (
              <option key={i.id} value={i.id}>
                N° {String(i.number).padStart(2, "0")} · {i.monthLabel} · {i.theme}
              </option>
            ))}
          </select>
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
          className="w-full text-sm border border-slate-300 rounded px-2 py-1.5"
        />
      </div>

      <div>
        <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
          Dek (sous-titre / chapeau, 1 phrase)
        </label>
        <input
          type="text"
          value={dek}
          onChange={(e) => setDek(e.target.value)}
          className="w-full text-sm border border-slate-300 rounded px-2 py-1.5"
        />
      </div>

      <div>
        <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
          Extrait (cards / SEO)
        </label>
        <textarea
          value={excerpt}
          onChange={(e) => setExcerpt(e.target.value)}
          rows={3}
          maxLength={500}
          className="w-full text-sm border border-slate-300 rounded px-2 py-1.5"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
            Catégorie
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as ArticleCategory)}
            className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 bg-white"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {ARTICLE_CATEGORY_META[c].label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
            Auteur (signataire)
          </label>
          <select
            value={authorId}
            onChange={(e) => setAuthorId(e.target.value)}
            className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 bg-white"
          >
            <option value="">— Non signé —</option>
            {authors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.title}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
            Temps de lecture (min)
          </label>
          <input
            type="number"
            min={1}
            max={90}
            value={readingTimeMinutes}
            onChange={(e) => setReadingTimeMinutes(parseInt(e.target.value, 10) || 1)}
            className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 tabular-nums"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_180px] gap-3">
        <div>
          <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
            Tags (séparés par des virgules)
          </label>
          <input
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="dollar, DXY, FCFA, macro"
            className="w-full text-sm border border-slate-300 rounded px-2 py-1.5"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
            Couleur accent
          </label>
          <div className="flex gap-2">
            <input
              type="color"
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
              className="w-10 h-8 border border-slate-300 rounded cursor-pointer"
            />
            <input
              type="text"
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
              className="flex-1 text-sm border border-slate-300 rounded px-2 py-1.5 font-mono"
            />
          </div>
        </div>
      </div>

      <div className="border border-slate-200 rounded-lg p-4 bg-white">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Corps de l&apos;article</h3>
            <p className="text-[11px] text-slate-500">
              Composez l&apos;article avec des blocs : paragraphe, titre, citation, callout, liste, stats.
            </p>
          </div>
          <span className="text-[11px] text-slate-400">{body.length} bloc{body.length > 1 ? "s" : ""}</span>
        </div>
        <ContentBlocksEditor value={body} onChange={setBody} articleSlug={slug} />
      </div>

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
            disabled={isPending || issues.length === 0}
            className="text-sm bg-slate-900 hover:bg-slate-700 text-white font-medium px-4 py-2 rounded disabled:opacity-50"
          >
            {isPending ? "Enregistrement…" : mode === "create" ? "Créer" : "Mettre à jour"}
          </button>
        </div>
      </div>
    </div>
  );
}
