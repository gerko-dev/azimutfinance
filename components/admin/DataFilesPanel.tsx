"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadDataFile } from "@/lib/admin/dataFiles";
import type { DataFileInfo } from "@/lib/admin/dataFiles";
import { CATEGORY_ORDER } from "@/lib/admin/dataFilesCatalog";
import type { FreshnessStatus } from "@/lib/admin/freshness";

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} ko`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${day}/${month}/${year} ${hh}:${mm}`;
}

function fmtDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function fmtLag(lagDays: number | null): string {
  if (lagDays === null) return "—";
  if (lagDays <= 0) return "aujourd'hui";
  if (lagDays === 1) return "hier";
  if (lagDays < 30) return `${lagDays} j`;
  if (lagDays < 365) return `${Math.round(lagDays / 30)} mois`;
  const y = lagDays / 365;
  return y < 2 ? `${y.toFixed(1)} an` : `${y.toFixed(1)} ans`;
}

const STATUS_STYLES: Record<
  FreshnessStatus,
  { label: string; bg: string; text: string }
> = {
  fresh: { label: "À jour", bg: "bg-emerald-100", text: "text-emerald-800" },
  stale: { label: "En retard", bg: "bg-amber-100", text: "text-amber-800" },
  outdated: { label: "Obsolète", bg: "bg-rose-100", text: "text-rose-800" },
  ref: { label: "Référentiel", bg: "bg-slate-100", text: "text-slate-600" },
  unknown: { label: "?", bg: "bg-slate-100", text: "text-slate-500" },
};

const CADENCE_LABEL: Record<string, string> = {
  "daily-business": "quotidien (5/7)",
  daily: "quotidien",
  monthly: "mensuel",
  yearly: "annuel",
  "event-driven": "événementiel",
  ref: "référentiel",
};

function StatusBadge({ status }: { status: FreshnessStatus }) {
  const s = STATUS_STYLES[status];
  return (
    <span
      className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${s.bg} ${s.text}`}
    >
      {s.label}
    </span>
  );
}

export default function DataFilesPanel({ files }: { files: DataFileInfo[] }) {
  const router = useRouter();
  const [uploading, startUpload] = useTransition();
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  function triggerFilePick(filename: string) {
    fileInputRefs.current[filename]?.click();
  }

  function onFileChange(filename: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFeedback(null);
    setUploadingFor(filename);

    const fd = new FormData();
    fd.append("file", file);
    fd.append("filename", filename);

    startUpload(async () => {
      const res = await uploadDataFile(fd);
      if (res.ok) {
        setFeedback({
          ok: true,
          msg: `${filename} mis à jour (${fmtSize(res.data.size)}). N'oublie pas de redémarrer le serveur en local pour invalider le cache mémoire.`,
        });
        router.refresh();
      } else {
        setFeedback({ ok: false, msg: res.error });
      }
      setUploadingFor(null);
      if (fileInputRefs.current[filename]) {
        fileInputRefs.current[filename]!.value = "";
      }
    });
  }

  const summary = useMemo(() => {
    let stale = 0;
    let outdated = 0;
    let unknown = 0;
    for (const f of files) {
      if (f.freshness.status === "stale") stale++;
      else if (f.freshness.status === "outdated") outdated++;
      else if (f.freshness.status === "unknown" && f.freshness.cadence !== "ref") unknown++;
    }
    return { stale, outdated, unknown };
  }, [files]);

  const grouped = useMemo(() => {
    const map = new Map<string, DataFileInfo[]>();
    for (const f of files) {
      const cat = f.freshness.category || "Autres";
      const arr = map.get(cat) ?? [];
      arr.push(f);
      map.set(cat, arr);
    }
    return map;
  }, [files]);

  const orderedCats = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const c of CATEGORY_ORDER) {
      if (grouped.has(c)) {
        result.push(c);
        seen.add(c);
      }
    }
    for (const c of grouped.keys()) {
      if (!seen.has(c)) result.push(c);
    }
    return result;
  }, [grouped]);

  return (
    <div className="space-y-4">
      {/* Bannière de synthèse fraîcheur */}
      {(summary.outdated > 0 || summary.stale > 0 || summary.unknown > 0) && (
        <div
          className={`rounded border p-3 text-xs ${
            summary.outdated > 0
              ? "bg-rose-50 border-rose-200 text-rose-900"
              : "bg-amber-50 border-amber-200 text-amber-900"
          }`}
        >
          <strong>État des données :</strong>{" "}
          {summary.outdated > 0 && (
            <>
              <span className="font-semibold">{summary.outdated}</span> fichier
              {summary.outdated > 1 ? "s" : ""} obsolète{summary.outdated > 1 ? "s" : ""}
              {(summary.stale > 0 || summary.unknown > 0) && " · "}
            </>
          )}
          {summary.stale > 0 && (
            <>
              <span className="font-semibold">{summary.stale}</span> en retard
              {summary.unknown > 0 && " · "}
            </>
          )}
          {summary.unknown > 0 && (
            <>
              <span className="font-semibold">{summary.unknown}</span> sans date détectable
            </>
          )}
          .
        </div>
      )}

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

      <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-900">
        <strong>⚠️ Attention :</strong> remplacer un fichier de données peut casser des pages
        si la nouvelle version a un format différent. L&apos;upload écrase l&apos;existant ;
        prends une copie de sauvegarde avant. En production sur Vercel, le filesystem est en
        lecture seule — l&apos;upload ne fonctionne qu&apos;en local / self-hosted.
      </div>

      {orderedCats.map((cat) => {
        const list = grouped.get(cat);
        if (!list || list.length === 0) return null;
        return (
          <section
            key={cat}
            className="bg-white rounded-lg border border-slate-200 overflow-hidden"
          >
            <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50">
              <h2 className="text-sm font-semibold text-slate-900">
                {cat} <span className="text-slate-400 font-normal">({list.length})</span>
              </h2>
            </div>
            <table className="w-full text-xs border-separate border-spacing-0">
              <thead>
                <tr className="text-slate-500 text-[10px] uppercase">
                  <th className="text-left font-medium py-2 pl-4 pr-2">Fichier</th>
                  <th className="text-left font-medium py-2 px-2">Statut</th>
                  <th className="text-left font-medium py-2 px-2">Dernière donnée</th>
                  <th className="text-right font-medium py-2 px-2">Lag</th>
                  <th className="text-right font-medium py-2 px-2">Lignes</th>
                  <th className="text-right font-medium py-2 px-2">Taille</th>
                  <th className="text-left font-medium py-2 px-2">Modifié</th>
                  <th className="text-right font-medium py-2 pr-4 pl-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {list.map((f) => {
                  const fr = f.freshness;
                  return (
                    <tr
                      key={f.filename}
                      className="border-t border-slate-100 hover:bg-slate-50"
                    >
                      <td className="py-1.5 pl-4 pr-2">
                        <div
                          className="font-mono text-slate-900"
                          title={fr.description}
                        >
                          {f.filename}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {CADENCE_LABEL[fr.cadence] ?? fr.cadence}
                          {fr.description && ` · ${fr.description}`}
                        </div>
                      </td>
                      <td className="py-1.5 px-2">
                        <StatusBadge status={fr.status} />
                        {fr.message && (
                          <div className="text-[10px] text-slate-400 mt-0.5 max-w-[14ch] truncate" title={fr.message}>
                            {fr.message}
                          </div>
                        )}
                      </td>
                      <td className="py-1.5 px-2 tabular-nums text-slate-700">
                        {fr.lastDataDate ? fmtDate(fr.lastDataDate) : "—"}
                      </td>
                      <td className="py-1.5 px-2 text-right tabular-nums text-slate-600">
                        {fmtLag(fr.lagDays)}
                      </td>
                      <td className="py-1.5 px-2 text-right tabular-nums text-slate-500">
                        {fr.rowCount !== null ? fr.rowCount.toLocaleString("fr-FR") : "—"}
                      </td>
                      <td className="py-1.5 px-2 text-right tabular-nums text-slate-700">
                        {fmtSize(f.size)}
                      </td>
                      <td className="py-1.5 px-2 text-slate-500 tabular-nums">
                        {fmtDateTime(f.modifiedAt)}
                      </td>
                      <td className="py-1.5 pr-4 pl-2 text-right">
                        <input
                          ref={(el) => {
                            fileInputRefs.current[f.filename] = el;
                          }}
                          type="file"
                          accept=".csv,text/csv"
                          onChange={(e) => onFileChange(f.filename, e)}
                          className="hidden"
                        />
                        <button
                          onClick={() => triggerFilePick(f.filename)}
                          disabled={uploading}
                          className="text-[11px] text-blue-700 hover:underline disabled:opacity-50"
                        >
                          {uploading && uploadingFor === f.filename
                            ? "Upload..."
                            : "Remplacer"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}
