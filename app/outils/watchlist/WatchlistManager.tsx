"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  WatchlistWithCount,
  Watchlist,
  WatchlistTargetType,
} from "@/lib/watchlists/types";
import type { EnrichedItem } from "@/lib/watchlists/enrich";
import {
  TARGET_TYPE_LABEL,
  formatTargetCode,
  targetHref,
} from "@/lib/watchlists/types";
import {
  createWatchlistAction,
  deleteWatchlistAction,
  removeFromWatchlistAction,
  renameWatchlistAction,
  updateItemNoteAction,
} from "@/lib/watchlists/actions";

type EnrichedWatchlist = Watchlist & { items: EnrichedItem[] };

function fmtNum(n: number): string {
  return n.toLocaleString("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function WatchlistManager({
  lists,
  selected,
  selectedId,
}: {
  lists: WatchlistWithCount[];
  selected: EnrichedWatchlist | null;
  selectedId: string | null;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-5">
      <aside className="space-y-2">
        <Sidebar lists={lists} selectedId={selectedId} />
      </aside>
      <section className="min-w-0">
        {lists.length === 0 ? (
          <EmptyState />
        ) : selected ? (
          <Detail list={selected} />
        ) : (
          <div className="bg-white border border-slate-200 rounded-lg p-8 text-center text-sm text-slate-500">
            Sélectionnez une liste à gauche.
          </div>
        )}
      </section>
    </div>
  );
}

function Sidebar({
  lists,
  selectedId,
}: {
  lists: WatchlistWithCount[];
  selectedId: string | null;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    if (!name.trim()) {
      setError("Nom requis.");
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.set("name", name.trim());
      const res = await createWatchlistAction(fd);
      if (res.ok) {
        setName("");
        setCreating(false);
        router.push(`/outils/watchlist?id=${res.data.id}`);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wide font-semibold text-slate-500">
          Mes listes
        </span>
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="text-[11px] text-blue-700 hover:underline"
        >
          {creating ? "Annuler" : "+ Nouvelle"}
        </button>
      </div>

      {creating && (
        <div className="p-2.5 border-b border-slate-100 space-y-2 bg-slate-50/50">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder="Nom de la liste"
            className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5 bg-white"
            autoFocus
          />
          {error && <div className="text-xs text-rose-700">{error}</div>}
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="w-full text-xs rounded-md bg-slate-900 text-white px-3 py-1.5 hover:bg-slate-800 disabled:opacity-60"
          >
            {pending ? "Création…" : "Créer"}
          </button>
        </div>
      )}

      {lists.length === 0 ? (
        <div className="px-3 py-6 text-xs text-slate-400 text-center">
          Aucune liste pour le moment.
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {lists.map((l) => {
            const active = selectedId === l.id;
            return (
              <li key={l.id}>
                <Link
                  href={`/outils/watchlist?id=${l.id}`}
                  className={`block px-3 py-2.5 hover:bg-slate-50 ${
                    active ? "bg-blue-50/50" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-900 truncate">
                      {l.name}
                    </span>
                    <span className="text-[10px] tabular-nums text-slate-500 shrink-0">
                      {l.item_count}
                    </span>
                  </div>
                  {l.is_default && (
                    <span className="text-[10px] uppercase font-semibold text-amber-700 mt-0.5 inline-block">
                      Défaut
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-8 text-center">
      <div className="text-4xl mb-3">⭐</div>
      <h2 className="text-base font-semibold text-slate-900 mb-1">
        Aucune watchlist
      </h2>
      <p className="text-sm text-slate-500 max-w-md mx-auto">
        Créez votre première liste pour épingler les titres BRVM, obligations,
        indices ou matières premières que vous voulez suivre. Ensuite, ajoutez
        des éléments depuis chaque fiche détail via le bouton ★.
      </p>
    </div>
  );
}

function Detail({ list }: { list: EnrichedWatchlist }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(list.name);
  const [description, setDescription] = useState(list.description ?? "");
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(
    null,
  );
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", list.id);
      fd.set("name", name);
      fd.set("description", description);
      const res = await renameWatchlistAction(fd);
      if (res.ok) {
        setEditing(false);
        router.refresh();
      } else {
        setFeedback({ ok: false, msg: res.error });
      }
    });
  }

  function remove() {
    if (
      !confirm(
        `Supprimer définitivement la liste « ${list.name} » et tous ses éléments ?`,
      )
    )
      return;
    startTransition(async () => {
      const res = await deleteWatchlistAction(list.id);
      if (res.ok) {
        router.push("/outils/watchlist");
        router.refresh();
      } else {
        setFeedback({ ok: false, msg: res.error });
      }
    });
  }

  return (
    <div className="space-y-4">
      <header className="bg-white border border-slate-200 rounded-lg p-4 md:p-5">
        {editing ? (
          <div className="space-y-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              className="w-full text-base font-semibold border border-slate-300 rounded-md px-3 py-2"
            />
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={300}
              placeholder="Description (optionnelle)"
              className="w-full text-sm border border-slate-300 rounded-md px-3 py-2"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setName(list.name);
                  setDescription(list.description ?? "");
                }}
                disabled={pending}
                className="px-3 py-1.5 text-xs rounded-md bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={save}
                disabled={pending}
                className="px-3 py-1.5 text-xs rounded-md bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {pending ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-slate-900">
                {list.name}
              </h2>
              {list.description && (
                <p className="text-xs text-slate-500 mt-1">{list.description}</p>
              )}
              <div className="text-[11px] text-slate-400 mt-1">
                {list.items.length} élément{list.items.length > 1 ? "s" : ""} ·
                créée le {fmtDate(list.created_at)}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEditing(true)}
                disabled={pending}
                className="text-[11px] text-slate-500 hover:text-slate-900 underline"
              >
                Renommer
              </button>
              <button
                type="button"
                onClick={remove}
                disabled={pending}
                className="text-[11px] text-rose-600 hover:text-rose-800 underline"
              >
                Supprimer
              </button>
            </div>
          </div>
        )}
        {feedback && !feedback.ok && (
          <div className="text-xs text-rose-700 mt-2">{feedback.msg}</div>
        )}
      </header>

      {list.items.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-8 text-center text-sm text-slate-500">
          Cette liste est vide. Ajoutez des éléments depuis les pages détail
          (bouton ★ sur les fiches titres, obligations, indices, devises,
          matières premières).
        </div>
      ) : (
        <ul className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
          {list.items.map((item) => (
            <Item key={item.id} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Item({
  item,
}: {
  item: EnrichedItem;
}) {
  const router = useRouter();
  const [editingNote, setEditingNote] = useState(false);
  const [note, setNote] = useState(item.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function saveNote() {
    setError(null);
    startTransition(async () => {
      const res = await updateItemNoteAction(item.id, note);
      if (res.ok) {
        setEditingNote(false);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  function removeItem() {
    if (!confirm("Retirer cet élément de la liste ?")) return;
    startTransition(async () => {
      const res = await removeFromWatchlistAction(item.id);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <Link
              href={targetHref(item.target_type as WatchlistTargetType, item.target_code)}
              className="text-sm font-semibold text-slate-900 hover:text-blue-700"
            >
              {formatTargetCode(item.target_type, item.target_code)}
            </Link>
            <span className="text-[10px] uppercase font-semibold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">
              {TARGET_TYPE_LABEL[item.target_type as WatchlistTargetType]}
            </span>
          </div>
          {item.target_label && (
            <div className="text-xs text-slate-500">{item.target_label}</div>
          )}
          {item.enriched.sublabel && (
            <div className="text-[11px] text-slate-400">
              {item.enriched.sublabel}
            </div>
          )}
          {item.enriched.error && (
            <div className="text-[11px] text-rose-600 mt-0.5">
              {item.enriched.error}
            </div>
          )}
          {editingNote ? (
            <div className="mt-2 space-y-2">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                maxLength={280}
                placeholder="Note privée (280 caractères max)"
                className="w-full text-xs border border-slate-300 rounded-md px-2 py-1.5"
              />
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setEditingNote(false);
                    setNote(item.note ?? "");
                  }}
                  disabled={pending}
                  className="px-2 py-1 text-[11px] rounded bg-white border border-slate-300 text-slate-700"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={saveNote}
                  disabled={pending}
                  className="px-2 py-1 text-[11px] rounded bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {pending ? "…" : "Enregistrer"}
                </button>
              </div>
            </div>
          ) : item.note ? (
            <div className="text-xs text-slate-700 bg-amber-50 border border-amber-200 rounded p-2 mt-1.5">
              {item.note}
            </div>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-1">
          {item.enriched.price !== null && (
            <div className="text-right">
              <div className="text-sm font-semibold tabular-nums text-slate-900">
                {fmtNum(item.enriched.price)}
                {item.enriched.unit && (
                  <span className="text-[10px] font-normal text-slate-500 ml-1">
                    {item.enriched.unit}
                  </span>
                )}
              </div>
              {item.enriched.ytdPct !== null && (
                <div
                  className={`text-[11px] tabular-nums font-medium ${
                    item.enriched.ytdPct >= 0
                      ? "text-emerald-700"
                      : "text-rose-700"
                  }`}
                  title="Variation depuis le 1er janvier"
                >
                  {item.enriched.ytdPct >= 0 ? "+" : ""}
                  {item.enriched.ytdPct.toFixed(2)} %
                  <span className="ml-1 text-[9px] uppercase font-semibold text-slate-400">
                    YTD
                  </span>
                </div>
              )}
            </div>
          )}
          <span className="text-[10px] text-slate-400">
            ajouté {fmtDate(item.added_at)}
          </span>
          <div className="flex gap-2">
            {!editingNote && (
              <button
                type="button"
                onClick={() => setEditingNote(true)}
                className="text-[11px] text-slate-500 hover:text-slate-900 underline"
              >
                {item.note ? "Modifier note" : "Ajouter note"}
              </button>
            )}
            <button
              type="button"
              onClick={removeItem}
              disabled={pending}
              className="text-[11px] text-rose-600 hover:text-rose-800 underline"
            >
              Retirer
            </button>
          </div>
          {error && <div className="text-[11px] text-rose-700">{error}</div>}
        </div>
      </div>
    </li>
  );
}
