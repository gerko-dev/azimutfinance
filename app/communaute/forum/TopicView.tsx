"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ForumReply, ForumTopicDetail } from "@/lib/forum/types";
import { FORUM_BODY_CLASSES, renderForumBody } from "@/lib/forum/markdown";
import {
  adminDeleteReplyAction,
  adminDeleteTopicAction,
  adminSetTopicFlagAction,
  createReplyAction,
  deleteOwnReplyAction,
  deleteOwnTopicAction,
  updateReplyAction,
  updateTopicAction,
  voteReplyAction,
  voteTopicAction,
} from "@/lib/forum/actions";
import ReportButton from "./ReportButton";

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function wasEdited(createdAt: string, updatedAt: string): boolean {
  // On considere "edite" si updated_at depasse created_at de plus d'1 minute
  return new Date(updatedAt).getTime() - new Date(createdAt).getTime() > 60_000;
}

function authorName(a: ForumReply["author"]): string {
  if (!a) return "Utilisateur supprimé";
  return a.full_name || a.username || "Utilisateur";
}

function authorInitials(a: ForumReply["author"]): string {
  const name = authorName(a);
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0]?.slice(0, 2) ?? "??").toUpperCase();
}

function authorBadge(role: string | null | undefined): {
  label: string;
  className: string;
} | null {
  if (!role) return null;
  if (role === "premium") return { label: "Premium", className: "bg-blue-100 text-blue-800" };
  if (role === "pro") return { label: "Pro", className: "bg-purple-100 text-purple-700" };
  if (role.startsWith("adminlevel"))
    return { label: "Admin", className: "bg-rose-100 text-rose-800" };
  return null;
}

export default function TopicView({
  topic,
  replies,
  currentUserId,
  adminLevel,
}: {
  topic: ForumTopicDetail;
  replies: ForumReply[];
  currentUserId: string | null;
  adminLevel: number | null;
}) {
  const isAdminL2 = adminLevel !== null && adminLevel <= 2;
  const isAdminL3 = adminLevel !== null && adminLevel <= 3;
  const router = useRouter();
  const [topicScore, setTopicScore] = useState(topic.vote_score);
  const [topicVote, setTopicVote] = useState<-1 | 0 | 1>(topic.user_vote);
  const [editingTopic, setEditingTopic] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Quote : un { text, key } qui change quand l'utilisateur clique "Citer".
  // Le `key` permet de re-prefiller le textarea meme si le texte est identique.
  const [quoteSeed, setQuoteSeed] = useState<{ text: string; key: number } | null>(
    null,
  );
  const replyFormRef = useRef<HTMLDivElement>(null);

  function quoteFrom(authorName: string, body: string) {
    const cleaned = body.replace(/\r\n/g, "\n");
    const quoted = cleaned
      .split("\n")
      .map((l) => `> ${l}`)
      .join("\n");
    const text = `> **${authorName} a écrit :**\n${quoted}\n\n`;
    setQuoteSeed({ text, key: Date.now() });
    replyFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const isTopicAuthor = !!currentUserId && currentUserId === topic.author_id;
  const topicEdited = wasEdited(topic.created_at, topic.updated_at);

  function castTopicVote(target: 1 | -1) {
    if (!currentUserId) {
      router.push(
        `/connexion?redirect=${encodeURIComponent(`/communaute/forum/t/${topic.id}`)}`,
      );
      return;
    }
    setError(null);
    // Toggle si on reclique le meme bouton, sinon swap
    const nextValue: -1 | 0 | 1 = topicVote === target ? 0 : target;
    const previousVote = topicVote;
    const previousScore = topicScore;
    // Optimiste
    setTopicVote(nextValue);
    setTopicScore((s) => s - previousVote + nextValue);
    startTransition(async () => {
      const res = await voteTopicAction(topic.id, nextValue);
      if (!res.ok) {
        setTopicVote(previousVote);
        setTopicScore(previousScore);
        setError(res.error);
      } else {
        setTopicScore(res.data.score);
      }
    });
  }

  return (
    <div>
      <article className="bg-white border border-slate-200 rounded-lg p-5 md:p-6">
        <div className="flex gap-4">
          <VoteCol
            score={topicScore}
            vote={topicVote}
            onVote={castTopicVote}
            disabled={pending}
          />
          <div className="min-w-0 flex-1">
            {editingTopic ? (
              <EditTopicForm
                topic={topic}
                onCancel={() => setEditingTopic(false)}
                onSaved={() => {
                  setEditingTopic(false);
                  router.refresh();
                }}
              />
            ) : (
              <>
                <h1 className="text-xl md:text-2xl font-semibold text-slate-900 leading-tight">
                  {topic.title}
                </h1>

                <div className="flex flex-wrap items-center gap-2 mt-2 mb-4">
                  {topic.pinned && (
                    <span className="text-[10px] uppercase font-semibold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                      📌 Épinglé
                    </span>
                  )}
                  {topic.locked && (
                    <span className="text-[10px] uppercase font-semibold bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">
                      🔒 Verrouillé
                    </span>
                  )}
                  {topic.tickers && topic.tickers.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {topic.tickers.map((t) => (
                        <Link
                          key={t}
                          href={`/communaute/forum/ticker/${t.toLowerCase()}`}
                          className="font-mono text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded hover:bg-slate-200"
                          title={`Voir les discussions sur ${t}`}
                        >
                          {t}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>

                <AuthorLine
                  author={topic.author}
                  createdAt={topic.created_at}
                  edited={topicEdited}
                />

                <div
                  className={`mt-4 ${FORUM_BODY_CLASSES}`}
                  dangerouslySetInnerHTML={{ __html: renderForumBody(topic.body) }}
                />

                <div className="mt-5 flex flex-wrap justify-end items-center gap-3">
                  {currentUserId && !topic.locked && (
                    <button
                      type="button"
                      onClick={() =>
                        quoteFrom(authorName(topic.author), topic.body)
                      }
                      className="text-[11px] text-slate-500 hover:text-slate-900 underline"
                    >
                      Citer
                    </button>
                  )}
                  {isTopicAuthor && !topic.locked && (
                    <>
                      <button
                        type="button"
                        onClick={() => setEditingTopic(true)}
                        className="text-[11px] text-slate-500 hover:text-slate-900 underline"
                      >
                        Modifier
                      </button>
                      <DeleteOwnTopicButton topicId={topic.id} />
                    </>
                  )}
                  {currentUserId && currentUserId !== topic.author_id && (
                    <ReportButton targetType="topic" targetId={topic.id} />
                  )}
                  {isAdminL2 && (
                    <AdminTopicActions
                      topicId={topic.id}
                      pinned={topic.pinned}
                      locked={topic.locked}
                      canDelete={isAdminL3}
                    />
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </article>

      {error && (
        <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-800">
          {error}
        </div>
      )}

      <div className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">
          {replies.length} réponse{replies.length > 1 ? "s" : ""}
        </h2>

        {replies.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-lg p-6 text-center text-sm text-slate-500">
            Pas encore de réponse. Soyez le premier à participer.
          </div>
        ) : (
          <div className="space-y-3">
            {replies.map((r) => (
              <ReplyCard
                key={r.id}
                reply={r}
                currentUserId={currentUserId}
                isAdminL3={isAdminL3}
                onQuote={
                  currentUserId && !topic.locked
                    ? (text) => quoteFrom(authorName(r.author), text)
                    : null
                }
              />
            ))}
          </div>
        )}
      </div>

      <div ref={replyFormRef} className="mt-8">
        {topic.locked ? (
          <div className="bg-slate-100 border border-slate-200 rounded-lg p-4 text-center text-sm text-slate-600">
            🔒 Cette discussion est verrouillée. Plus aucune réponse n&apos;est
            acceptée.
          </div>
        ) : currentUserId ? (
          <ReplyForm topicId={topic.id} quoteSeed={quoteSeed} />
        ) : (
          <div className="bg-white border border-slate-200 rounded-lg p-5 text-center">
            <div className="text-sm text-slate-700 mb-2">
              Connectez-vous pour répondre à cette discussion.
            </div>
            <Link
              href={`/connexion?redirect=/communaute/forum/t/${topic.id}`}
              className="inline-block px-4 py-2 rounded-md bg-blue-700 text-white text-sm font-medium hover:bg-blue-800"
            >
              Se connecter
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function VoteCol({
  score,
  vote,
  onVote,
  disabled,
}: {
  score: number;
  vote: -1 | 0 | 1;
  onVote: (target: 1 | -1) => void;
  disabled: boolean;
}) {
  const liked = vote === 1;
  const disliked = vote === -1;
  return (
    <div className="flex flex-col items-center w-12 shrink-0">
      <button
        type="button"
        onClick={() => onVote(1)}
        disabled={disabled}
        aria-label={liked ? "Retirer mon like" : "Like"}
        title={liked ? "Retirer mon like" : "J'aime"}
        className={`w-9 h-9 rounded-md flex items-center justify-center transition ${
          liked
            ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
            : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        } disabled:opacity-50`}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill={liked ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M7 10v12" />
          <path d="M15 5.88 14 12h5.83a2 2 0 0 1 1.96 2.4l-1.21 6A2 2 0 0 1 18.62 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
        </svg>
      </button>
      <div
        className={`text-sm font-bold tabular-nums my-1 ${
          score > 0
            ? "text-emerald-700"
            : score < 0
              ? "text-rose-700"
              : "text-slate-900"
        }`}
      >
        {score}
      </div>
      <button
        type="button"
        onClick={() => onVote(-1)}
        disabled={disabled}
        aria-label={disliked ? "Retirer mon dislike" : "Dislike"}
        title={disliked ? "Retirer mon dislike" : "Je n'aime pas"}
        className={`w-9 h-9 rounded-md flex items-center justify-center transition ${
          disliked
            ? "bg-rose-100 text-rose-700 hover:bg-rose-200"
            : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        } disabled:opacity-50`}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill={disliked ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M17 14V2" />
          <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" />
        </svg>
      </button>
    </div>
  );
}

function AuthorLine({
  author,
  createdAt,
  edited,
}: {
  author: ForumReply["author"];
  createdAt: string;
  edited?: boolean;
}) {
  const initials = authorInitials(author);
  const badge = authorBadge(author?.role);
  return (
    <div className="flex items-center gap-2 text-xs text-slate-500">
      <span className="w-7 h-7 rounded-full bg-slate-700 text-white flex items-center justify-center text-[10px] font-semibold">
        {initials}
      </span>
      <span className="font-medium text-slate-700">{authorName(author)}</span>
      {badge && (
        <span
          className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${badge.className}`}
        >
          {badge.label}
        </span>
      )}
      <span className="text-slate-300">·</span>
      <span>{fmtDateTime(createdAt)}</span>
      {edited && (
        <span className="text-slate-400 italic">(modifié)</span>
      )}
    </div>
  );
}

function ReplyCard({
  reply,
  currentUserId,
  isAdminL3,
  onQuote,
}: {
  reply: ForumReply;
  currentUserId: string | null;
  isAdminL3: boolean;
  onQuote: ((body: string) => void) | null;
}) {
  const router = useRouter();
  const [score, setScore] = useState(reply.vote_score);
  const [vote, setVote] = useState<-1 | 0 | 1>(reply.user_vote);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isAuthor = !!currentUserId && currentUserId === reply.author_id;
  const edited = wasEdited(reply.created_at, reply.updated_at);

  function castVote(target: 1 | -1) {
    if (!currentUserId) {
      router.push(
        `/connexion?redirect=${encodeURIComponent(`/communaute/forum/t/${reply.topic_id}`)}`,
      );
      return;
    }
    setError(null);
    const nextValue: -1 | 0 | 1 = vote === target ? 0 : target;
    const previousVote = vote;
    const previousScore = score;
    setVote(nextValue);
    setScore((s) => s - previousVote + nextValue);
    startTransition(async () => {
      const res = await voteReplyAction(reply.id, nextValue);
      if (!res.ok) {
        setVote(previousVote);
        setScore(previousScore);
        setError(res.error);
      } else {
        setScore(res.data.score);
      }
    });
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 md:p-5">
      <div className="flex gap-4">
        <VoteCol
          score={score}
          vote={vote}
          onVote={castVote}
          disabled={pending}
        />
        <div className="min-w-0 flex-1">
          {editing ? (
            <EditReplyForm
              reply={reply}
              onCancel={() => setEditing(false)}
              onSaved={() => {
                setEditing(false);
                router.refresh();
              }}
            />
          ) : (
            <>
              <AuthorLine
                author={reply.author}
                createdAt={reply.created_at}
                edited={edited}
              />
              <div
                className={`mt-3 ${FORUM_BODY_CLASSES}`}
                dangerouslySetInnerHTML={{ __html: renderForumBody(reply.body) }}
              />
              {error && (
                <div className="mt-2 text-xs text-rose-700">{error}</div>
              )}
              <div className="mt-3 flex flex-wrap justify-end items-center gap-3">
                {onQuote && (
                  <button
                    type="button"
                    onClick={() => onQuote(reply.body)}
                    className="text-[11px] text-slate-500 hover:text-slate-900 underline"
                  >
                    Citer
                  </button>
                )}
                {isAuthor && (
                  <>
                    <button
                      type="button"
                      onClick={() => setEditing(true)}
                      className="text-[11px] text-slate-500 hover:text-slate-900 underline"
                    >
                      Modifier
                    </button>
                    <DeleteOwnReplyButton
                      replyId={reply.id}
                      topicId={reply.topic_id}
                    />
                  </>
                )}
                {currentUserId && currentUserId !== reply.author_id && (
                  <ReportButton targetType="reply" targetId={reply.id} />
                )}
                {isAdminL3 && (
                  <AdminReplyActions
                    replyId={reply.id}
                    topicId={reply.topic_id}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function EditTopicForm({
  topic,
  onCancel,
  onSaved,
}: {
  topic: ForumTopicDetail;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(topic.title);
  const [body, setBody] = useState(topic.body);
  const [tickers, setTickers] = useState(
    topic.tickers && topic.tickers.length > 0 ? topic.tickers.join(", ") : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("topic_id", topic.id);
      fd.set("title", title.trim());
      fd.set("body", body.trim());
      if (tickers.trim()) fd.set("tickers", tickers.trim());
      const res = await updateTopicAction(fd);
      if (res.ok) {
        onSaved();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="space-y-3">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={200}
        className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={8}
        maxLength={10000}
        className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 resize-y"
      />
      <input
        type="text"
        value={tickers}
        onChange={(e) => setTickers(e.target.value)}
        placeholder="Tickers (optionnel)"
        className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
      />
      {error && <div className="text-xs text-rose-700">{error}</div>}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="px-3 py-1.5 text-xs rounded-md bg-white border border-slate-300 hover:bg-slate-50 text-slate-700"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="px-3 py-1.5 text-xs rounded-md bg-blue-700 hover:bg-blue-800 text-white disabled:opacity-60"
        >
          {pending ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}

function EditReplyForm({
  reply,
  onCancel,
  onSaved,
}: {
  reply: ForumReply;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [body, setBody] = useState(reply.body);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("reply_id", reply.id);
      fd.set("topic_id", reply.topic_id);
      fd.set("body", body.trim());
      const res = await updateReplyAction(fd);
      if (res.ok) {
        onSaved();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="space-y-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={5}
        maxLength={10000}
        className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 resize-y"
      />
      {error && <div className="text-xs text-rose-700">{error}</div>}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="px-3 py-1.5 text-xs rounded-md bg-white border border-slate-300 hover:bg-slate-50 text-slate-700"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="px-3 py-1.5 text-xs rounded-md bg-blue-700 hover:bg-blue-800 text-white disabled:opacity-60"
        >
          {pending ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}

function ReplyForm({
  topicId,
  quoteSeed,
}: {
  topicId: string;
  quoteSeed: { text: string; key: number } | null;
}) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Quand l'utilisateur clique "Citer", on prefixe le textarea sans ecraser ce
  // qui est deja saisi. Identifie par quoteSeed.key (timestamp) pour redeclencher
  // meme si le texte est identique.
  useEffect(() => {
    if (!quoteSeed) return;
    setBody((current) => quoteSeed.text + current);
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (ta) {
        ta.focus();
        // Curseur a la fin de la citation pour ecrire dessous
        const pos = quoteSeed.text.length;
        ta.setSelectionRange(pos, pos);
      }
    });
  }, [quoteSeed]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (body.trim().length === 0) {
      setError("Le message ne peut pas être vide.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("topic_id", topicId);
      fd.set("body", body.trim());
      const res = await createReplyAction(fd);
      if (res.ok) {
        setBody("");
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <form
      onSubmit={submit}
      className="bg-white border border-slate-200 rounded-lg p-4 md:p-5"
    >
      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
        Votre réponse
      </label>
      <textarea
        ref={textareaRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={5}
        placeholder="Apportez du contexte, citez des chiffres, restez courtois…"
        className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 resize-y"
      />
      <MarkdownHint />
      {error && (
        <div className="mt-2 text-xs text-rose-700">{error}</div>
      )}
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-[11px] text-slate-500">
          {body.length} / 10 000 caractères
        </span>
        <button
          type="submit"
          disabled={pending || body.trim().length === 0}
          className="px-4 py-2 rounded-md bg-blue-700 text-white text-sm font-medium hover:bg-blue-800 disabled:opacity-60"
        >
          {pending ? "Publication…" : "Publier la réponse"}
        </button>
      </div>
    </form>
  );
}

function MarkdownHint() {
  return (
    <p className="text-[11px] text-slate-400 mt-1.5 font-mono">
      Formatage : **gras** · *italique* · `code` · [lien](url) · &gt; citation · - liste
    </p>
  );
}

// =================================================================
//  Suppression par l'auteur
// =================================================================

function DeleteOwnTopicButton({ topicId }: { topicId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function confirmDelete() {
    if (!confirm("Supprimer définitivement cette discussion ? Action irréversible.")) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteOwnTopicAction(topicId);
      if (res.ok) {
        router.push("/communaute/forum");
      } else {
        setError(res.error);
      }
    });
  }
  return (
    <>
      <button
        type="button"
        onClick={confirmDelete}
        disabled={pending}
        className="text-[11px] text-rose-600 hover:text-rose-800 underline disabled:opacity-50"
      >
        {pending ? "Suppression…" : "Supprimer"}
      </button>
      {error && <span className="text-[11px] text-rose-700">{error}</span>}
    </>
  );
}

function DeleteOwnReplyButton({
  replyId,
  topicId,
}: {
  replyId: string;
  topicId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function confirmDelete() {
    if (!confirm("Supprimer définitivement cette réponse ? Action irréversible.")) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteOwnReplyAction(replyId, topicId);
      if (res.ok) {
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }
  return (
    <>
      <button
        type="button"
        onClick={confirmDelete}
        disabled={pending}
        className="text-[11px] text-rose-600 hover:text-rose-800 underline disabled:opacity-50"
      >
        {pending ? "…" : "Supprimer"}
      </button>
      {error && <span className="text-[11px] text-rose-700">{error}</span>}
    </>
  );
}

// =================================================================
//  Actions admin in-context
// =================================================================

function AdminTopicActions({
  topicId,
  pinned,
  locked,
  canDelete,
}: {
  topicId: string;
  pinned: boolean;
  locked: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [deleteMode, setDeleteMode] = useState(false);
  const [reason, setReason] = useState("");

  function togglePinned() {
    setError(null);
    startTransition(async () => {
      const res = await adminSetTopicFlagAction(topicId, { pinned: !pinned });
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }
  function toggleLocked() {
    setError(null);
    startTransition(async () => {
      const res = await adminSetTopicFlagAction(topicId, { locked: !locked });
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }
  function confirmDelete() {
    if (!reason.trim()) {
      setError("Motif requis.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await adminDeleteTopicAction(topicId, reason.trim());
      if (res.ok) {
        router.push("/communaute/forum");
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-l border-slate-200 pl-3 ml-1">
      <span className="text-[9px] uppercase font-semibold tracking-wide text-rose-700">
        Admin
      </span>
      <button
        type="button"
        onClick={togglePinned}
        disabled={pending}
        className="text-[11px] px-2 py-0.5 rounded bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 disabled:opacity-50"
      >
        {pinned ? "Désépingler" : "Épingler"}
      </button>
      <button
        type="button"
        onClick={toggleLocked}
        disabled={pending}
        className="text-[11px] px-2 py-0.5 rounded bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-300 disabled:opacity-50"
      >
        {locked ? "Déverrouiller" : "Verrouiller"}
      </button>
      {canDelete && !deleteMode && (
        <button
          type="button"
          onClick={() => setDeleteMode(true)}
          disabled={pending}
          className="text-[11px] px-2 py-0.5 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 disabled:opacity-50"
        >
          Supprimer
        </button>
      )}
      {canDelete && deleteMode && (
        <div className="basis-full mt-2 flex flex-wrap gap-2 items-start bg-rose-50 border border-rose-200 rounded-md p-2">
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Motif (audit)…"
            className="flex-1 min-w-[200px] text-xs border border-rose-300 rounded px-2 py-1"
          />
          <button
            type="button"
            onClick={confirmDelete}
            disabled={pending}
            className="text-[11px] px-2 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-50"
          >
            {pending ? "…" : "Confirmer"}
          </button>
          <button
            type="button"
            onClick={() => {
              setDeleteMode(false);
              setReason("");
              setError(null);
            }}
            disabled={pending}
            className="text-[11px] px-2 py-1 rounded bg-white border border-slate-300 text-slate-700"
          >
            Annuler
          </button>
        </div>
      )}
      {error && (
        <span className="basis-full text-[11px] text-rose-700">{error}</span>
      )}
    </div>
  );
}

function AdminReplyActions({
  replyId,
  topicId,
}: {
  replyId: string;
  topicId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [deleteMode, setDeleteMode] = useState(false);
  const [reason, setReason] = useState("");

  function confirmDelete() {
    if (!reason.trim()) {
      setError("Motif requis.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await adminDeleteReplyAction(replyId, topicId, reason.trim());
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-l border-slate-200 pl-3 ml-1">
      <span className="text-[9px] uppercase font-semibold tracking-wide text-rose-700">
        Admin
      </span>
      {!deleteMode ? (
        <button
          type="button"
          onClick={() => setDeleteMode(true)}
          disabled={pending}
          className="text-[11px] px-2 py-0.5 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 disabled:opacity-50"
        >
          Supprimer
        </button>
      ) : (
        <div className="basis-full mt-2 flex flex-wrap gap-2 items-start bg-rose-50 border border-rose-200 rounded-md p-2">
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Motif (audit)…"
            className="flex-1 min-w-[200px] text-xs border border-rose-300 rounded px-2 py-1"
          />
          <button
            type="button"
            onClick={confirmDelete}
            disabled={pending}
            className="text-[11px] px-2 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-50"
          >
            {pending ? "…" : "Confirmer"}
          </button>
          <button
            type="button"
            onClick={() => {
              setDeleteMode(false);
              setReason("");
              setError(null);
            }}
            disabled={pending}
            className="text-[11px] px-2 py-1 rounded bg-white border border-slate-300 text-slate-700"
          >
            Annuler
          </button>
        </div>
      )}
      {error && (
        <span className="basis-full text-[11px] text-rose-700">{error}</span>
      )}
    </div>
  );
}
