"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { TradeTick } from "@/lib/simulator/queries";

const fmtNum = (n: number) => n.toLocaleString("fr-FR");

export default function TradesTape({ trades }: { trades: TradeTick[] }) {
  const router = useRouter();

  // Auto-refresh régulier pour suivre la tape en live
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 5_000);
    return () => clearInterval(id);
  }, [router]);

  // Détermine la couleur de chaque trade : up-tick (prix > précédent) =
  // vert, down-tick = rouge, flat = gris.
  const annotated = useMemo(() => {
    // trades reçu en DESC ; on inverse pour calcul + on remet en DESC
    const asc = [...trades].sort((a, b) =>
      a.executed_at.localeCompare(b.executed_at),
    );
    let prev: number | null = null;
    const out: Array<TradeTick & { dir: "up" | "down" | "flat" }> = [];
    for (const t of asc) {
      let dir: "up" | "down" | "flat" = "flat";
      if (prev !== null) {
        if (t.price > prev) dir = "up";
        else if (t.price < prev) dir = "down";
      }
      out.push({ ...t, dir });
      prev = t.price;
    }
    return out.reverse();
  }, [trades]);

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden h-full flex flex-col">
      <div className="px-3 py-2 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Trades simulateur</h3>
          <p className="text-[9px] text-slate-500">
            Joueur ↔ joueur — pas le cours BRVM
          </p>
        </div>
        <span className="text-[10px] text-slate-500">
          {trades.length} dernier{trades.length !== 1 ? "s" : ""}
        </span>
      </div>

      {annotated.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-xs text-slate-400 p-6">
          Aucune transaction enregistrée sur ce titre.
        </div>
      ) : (
        <div className="overflow-y-auto flex-1 max-h-[480px]">
          <table className="w-full text-[11px] font-mono">
            <thead className="sticky top-0 bg-slate-50 z-10">
              <tr className="text-[9px] uppercase font-semibold text-slate-500 font-sans">
                <th className="text-left px-3 py-1">Heure</th>
                <th className="text-right px-3 py-1">Prix</th>
                <th className="text-right px-3 py-1">Qté</th>
              </tr>
            </thead>
            <tbody>
              {annotated.map((t) => (
                <tr
                  key={t.id}
                  className="border-t border-slate-50 hover:bg-slate-50"
                >
                  <td className="px-3 py-1 text-slate-600 tabular-nums">
                    {new Date(t.executed_at).toLocaleTimeString("fr-FR", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </td>
                  <td
                    className={`px-3 py-1 text-right tabular-nums font-bold ${
                      t.dir === "up"
                        ? "text-emerald-700"
                        : t.dir === "down"
                        ? "text-rose-700"
                        : "text-slate-700"
                    }`}
                  >
                    {fmtNum(t.price)}
                    {t.dir === "up" && " ▲"}
                    {t.dir === "down" && " ▼"}
                  </td>
                  <td className="px-3 py-1 text-right tabular-nums text-slate-700">
                    {fmtNum(t.units)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
