"use client";

import { useState } from "react";
import PresenceList from "./PresenceList";
import PresenceAnalytics from "./PresenceAnalytics";
import type { AdminPresenceEntry } from "@/lib/admin/types";
import type {
  PresenceLive,
  PresenceSnapshotRow,
} from "@/lib/admin/presenceAnalytics";

type Tab = "analytics" | "members";

/**
 * Onglets de /admin/presence :
 *  - « Analytique du site » : trafic global (anonymes inclus), dispatching par
 *    page, historique des snapshots 8 h.
 *  - « Membres connectés » : la vue orientée compte historique (PresenceList).
 */
export default function PresenceTabs({
  entries,
  live,
  snapshots,
}: {
  entries: AdminPresenceEntry[];
  live: PresenceLive;
  snapshots: PresenceSnapshotRow[];
}) {
  const [tab, setTab] = useState<Tab>("analytics");

  const tabs: { id: Tab; label: string }[] = [
    { id: "analytics", label: "Analytique du site" },
    { id: "members", label: `Membres connectés (${entries.length})` },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-slate-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition ${
              tab === t.id
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "analytics" ? (
        <PresenceAnalytics live={live} snapshots={snapshots} />
      ) : (
        <PresenceList entries={entries} />
      )}
    </div>
  );
}
