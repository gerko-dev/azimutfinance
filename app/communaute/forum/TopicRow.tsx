import Link from "next/link";
import type { ForumTopicListItem } from "@/lib/forum/types";

function authorName(a: ForumTopicListItem["author"]): string {
  if (!a) return "Utilisateur";
  return a.full_name || a.username || "Utilisateur";
}

function fmtRelative(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const sec = Math.max(1, Math.floor(diffMs / 1000));
  if (sec < 60) return `il y a ${sec} s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `il y a ${days} j`;
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function TopicRow({
  topic,
  showCategory,
}: {
  topic: ForumTopicListItem;
  showCategory?: boolean;
}) {
  const href = `/communaute/forum/t/${topic.id}`;
  const lastWho = topic.last_reply_user
    ? authorName(topic.last_reply_user)
    : authorName(topic.author);
  const lastWhen = topic.last_reply_at ?? topic.created_at;
  return (
    <Link
      href={href}
      className="flex flex-wrap items-start gap-3 px-4 py-3 hover:bg-slate-50 transition"
    >
      {/* Score + replies */}
      <div className="flex flex-col items-center w-12 shrink-0 pt-0.5">
        <div className="text-sm font-bold tabular-nums text-slate-900">
          {topic.vote_score}
        </div>
        <div className="text-[9px] uppercase text-slate-400">votes</div>
        <div className="mt-1.5 text-sm tabular-nums text-slate-700">
          {topic.reply_count}
        </div>
        <div className="text-[9px] uppercase text-slate-400">rép.</div>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 mb-0.5">
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
          {showCategory && topic.category_slug && (
            <span className="text-[10px] uppercase font-semibold bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">
              {topic.category_name}
            </span>
          )}
        </div>
        <div className="text-sm font-semibold text-slate-900 leading-snug line-clamp-2">
          {topic.title}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500 mt-1">
          <span>par {authorName(topic.author)}</span>
          {topic.tickers && topic.tickers.length > 0 && (
            <>
              <span className="text-slate-300">·</span>
              <span className="flex flex-wrap gap-1">
                {topic.tickers.slice(0, 4).map((t) => (
                  <span
                    key={t}
                    className="font-mono text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded hover:bg-slate-200"
                  >
                    {t}
                  </span>
                ))}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="text-right shrink-0 text-[11px] text-slate-500 min-w-[7rem]">
        <div className="text-slate-700 truncate max-w-[8rem]">{lastWho}</div>
        <div>{fmtRelative(lastWhen)}</div>
      </div>
    </Link>
  );
}
