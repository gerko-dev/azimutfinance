"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { setInscriptionStatus } from "@/lib/formations/actions";
import {
  INSCRIPTION_STATUS_COLOR,
  INSCRIPTION_STATUS_LABEL,
  PAYMENT_METHOD_LABEL,
  UEMOA_COUNTRIES,
} from "@/lib/formations";
import { fmtDateTime, fmtNumber } from "@/components/admin/format";
import type { InscriptionRow, InscriptionStatus } from "@/lib/formations/types";

const STATUSES: InscriptionStatus[] = ["en_attente", "confirmee", "payee", "annulee"];

function countryLabel(code: string | null): string {
  if (!code) return "—";
  return UEMOA_COUNTRIES.find((c) => c.code === code)?.label ?? code;
}

export default function InscriptionsTable({
  inscriptions,
  compact = false,
}: {
  inscriptions: InscriptionRow[];
  compact?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  function changeStatus(id: string, status: InscriptionStatus) {
    setError(null);
    startTransition(async () => {
      const res = await setInscriptionStatus(id, status);
      if (res.ok) {
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  if (inscriptions.length === 0) {
    return (
      <div className="text-xs text-slate-400 text-center py-8">
        Aucune inscription pour le moment.
      </div>
    );
  }

  return (
    <div className="overflow-hidden">
      {error && (
        <div className="m-3 text-xs px-3 py-2 rounded border bg-rose-50 border-rose-200 text-rose-800">
          {error}
        </div>
      )}
      <table className="w-full text-xs border-separate border-spacing-0">
        <thead>
          <tr className="text-slate-500 text-[10px] uppercase">
            <th className="text-left font-medium py-2 pl-4 pr-2">Personne</th>
            {!compact && (
              <th className="text-left font-medium py-2 px-2">Formation</th>
            )}
            <th className="text-left font-medium py-2 px-2">Contact</th>
            <th className="text-left font-medium py-2 px-2">Pays</th>
            <th className="text-left font-medium py-2 px-2">Paiement</th>
            <th className="text-right font-medium py-2 px-2">Montant</th>
            <th className="text-left font-medium py-2 px-2">Statut</th>
            <th className="text-left font-medium py-2 px-2">Inscrit le</th>
            <th className="text-right font-medium py-2 pr-4 pl-2">Action</th>
          </tr>
        </thead>
        <tbody>
          {inscriptions.map((i) => (
            <FragmentRow
              key={i.id}
              i={i}
              compact={compact}
              isOpen={openId === i.id}
              onToggle={() => setOpenId(openId === i.id ? null : i.id)}
              onChangeStatus={(s) => changeStatus(i.id, s)}
              isPending={isPending}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FragmentRow({
  i,
  compact,
  isOpen,
  onToggle,
  onChangeStatus,
  isPending,
}: {
  i: InscriptionRow;
  compact: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onChangeStatus: (status: InscriptionStatus) => void;
  isPending: boolean;
}) {
  const statusColor = INSCRIPTION_STATUS_COLOR[i.status];
  return (
    <>
      <tr className="border-t border-slate-100 hover:bg-slate-50">
        <td className="py-2 pl-4 pr-2">
          <div className="font-medium text-slate-900">{i.full_name}</div>
          {i.user_username && (
            <div className="text-[10px] text-slate-400 font-mono">
              @{i.user_username}
            </div>
          )}
        </td>
        {!compact && (
          <td className="py-2 px-2 max-w-xs truncate">
            <Link
              href={`/admin/formations/${i.formation_id}`}
              className="text-blue-700 hover:underline"
            >
              {i.formation_title}
            </Link>
          </td>
        )}
        <td className="py-2 px-2 text-slate-700">
          <div className="truncate max-w-[180px]" title={i.email}>
            {i.email}
          </div>
          <div className="text-[10px] text-slate-500 tabular-nums">{i.phone}</div>
        </td>
        <td className="py-2 px-2 text-slate-700">{countryLabel(i.country)}</td>
        <td className="py-2 px-2 text-slate-700">
          {PAYMENT_METHOD_LABEL[i.payment_method]}
        </td>
        <td className="py-2 px-2 text-right tabular-nums text-slate-700">
          {i.montant_fcfa > 0 ? `${fmtNumber(i.montant_fcfa)} FCFA` : "—"}
        </td>
        <td className="py-2 px-2">
          <span
            className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded"
            style={{ background: statusColor + "15", color: statusColor }}
          >
            {INSCRIPTION_STATUS_LABEL[i.status]}
          </span>
        </td>
        <td className="py-2 px-2 text-slate-500 tabular-nums">
          {fmtDateTime(i.created_at)}
        </td>
        <td className="py-2 pr-4 pl-2 text-right">
          <button
            type="button"
            onClick={onToggle}
            className="text-[11px] text-blue-700 hover:underline"
          >
            {isOpen ? "Fermer" : "Gérer"}
          </button>
        </td>
      </tr>
      {isOpen && (
        <tr className="bg-slate-50/70 border-t border-slate-100">
          <td colSpan={compact ? 8 : 9} className="px-4 py-3">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-[11px] text-slate-500">Changer le statut :</span>
              {STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onChangeStatus(s)}
                  disabled={isPending || s === i.status}
                  className={`text-[11px] px-2 py-1 rounded border transition ${
                    s === i.status
                      ? "border-slate-300 bg-white text-slate-400 cursor-default"
                      : "border-slate-300 bg-white hover:bg-slate-100 text-slate-700"
                  }`}
                >
                  {INSCRIPTION_STATUS_LABEL[s]}
                </button>
              ))}
            </div>
            {i.notes && (
              <div className="mt-2 text-[11px] text-slate-500 italic">
                « {i.notes} »
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
