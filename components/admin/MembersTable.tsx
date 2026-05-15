"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteUser, setMemberTier, setUserRole } from "@/lib/admin/actions";
import {
  ROLE_COLOR,
  ROLE_LABEL,
  type AdminMember,
  type AppRole,
} from "@/lib/admin/types";
import { getCountryLabel } from "@/lib/onboarding/countries";
import { fmtDateTime } from "./format";

const ALL_ROLES: AppRole[] = [
  "member",
  "premium",
  "pro",
  "adminlevel3",
  "adminlevel2",
  "adminlevel1",
];

export default function MembersTable({
  members,
  myLevel,
  myUserId,
}: {
  members: AdminMember[];
  myLevel: 1 | 2 | 3;
  myUserId: string;
}) {
  const router = useRouter();
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [pendingRole, setPendingRole] = useState<AppRole | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  const canEditRole = myLevel === 1;
  const canEditTier = myLevel <= 2; // L1 et L2
  const canDelete = myLevel === 1;

  function applyRole(userId: string, targetIsAdmin: boolean) {
    if (!pendingRole) return;
    const isAdminTarget =
      pendingRole === "adminlevel1" ||
      pendingRole === "adminlevel2" ||
      pendingRole === "adminlevel3";
    startTransition(async () => {
      let res;
      if (myLevel === 1) {
        // L1 utilise admin_set_role qui peut tout faire
        res = await setUserRole({ userId, role: pendingRole });
      } else {
        // L2 : utilise admin_set_member_tier (refuse si target ou role est admin)
        if (isAdminTarget || targetIsAdmin) {
          setFeedback({
            ok: false,
            msg: "Seul le niveau 1 peut modifier le rôle d'un admin.",
          });
          return;
        }
        const tier = pendingRole as "member" | "premium" | "pro";
        res = await setMemberTier({ userId, tier });
      }
      if (res.ok) {
        setFeedback({ ok: true, msg: "Rôle mis à jour." });
        setEditingRole(null);
        setPendingRole(null);
        router.refresh();
      } else {
        setFeedback({ ok: false, msg: res.error });
      }
    });
  }

  function executeDelete(userId: string) {
    if (!deleteReason.trim()) {
      setFeedback({ ok: false, msg: "La raison est obligatoire." });
      return;
    }
    startTransition(async () => {
      const res = await deleteUser({ userId, reason: deleteReason.trim() });
      if (res.ok) {
        setFeedback({ ok: true, msg: "Compte supprimé." });
        setConfirmDelete(null);
        setDeleteReason("");
        router.refresh();
      } else {
        setFeedback({ ok: false, msg: res.error });
      }
    });
  }

  return (
    <div>
      {feedback && (
        <div
          className={`mb-3 text-xs px-3 py-2 rounded border ${
            feedback.ok
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          {feedback.msg}
        </div>
      )}
      <div className="overflow-x-auto bg-white rounded-lg border border-slate-200">
        <table className="w-full text-xs border-separate border-spacing-0">
          <thead>
            <tr className="text-slate-500 text-[10px] uppercase">
              <th className="text-left font-medium py-2 pl-4 pr-2">Utilisateur</th>
              <th className="text-left font-medium py-2 px-2">Email</th>
              <th className="text-left font-medium py-2 px-2">Rôle</th>
              <th className="text-left font-medium py-2 px-2">Pays</th>
              <th className="text-left font-medium py-2 px-2">Inscrit</th>
              <th className="text-right font-medium py-2 pr-4 pl-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {members.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-400">
                  Aucun membre.
                </td>
              </tr>
            ) : (
              members.map((m) => {
                const isMe = m.id === myUserId;
                const editing = editingRole === m.id;
                const deleting = confirmDelete === m.id;
                return (
                  <tr key={m.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="py-2 pl-4 pr-2">
                      <Link
                        href={`/admin/membres/${m.id}`}
                        className="font-medium text-slate-900 hover:text-blue-700 hover:underline"
                      >
                        {m.full_name || m.username || "—"}
                      </Link>
                      {isMe && (
                        <span className="ml-2 text-[10px] text-blue-700 font-semibold uppercase">
                          moi
                        </span>
                      )}
                      <div className="text-[10px] text-slate-500">
                        {m.username ? `@${m.username}` : m.id.slice(0, 8)}
                      </div>
                    </td>
                    <td className="py-2 px-2 text-slate-700 truncate max-w-[200px]">
                      {m.email || "—"}
                    </td>
                    <td className="py-2 px-2">
                      {editing ? (
                        <div className="flex items-center gap-1">
                          <select
                            value={pendingRole ?? m.role}
                            onChange={(e) => setPendingRole(e.target.value as AppRole)}
                            className="text-[11px] border border-slate-300 rounded px-1.5 py-1"
                          >
                            {(myLevel === 1
                              ? ALL_ROLES
                              : (["member", "premium", "pro"] as AppRole[])).map((r) => (
                              <option key={r} value={r}>
                                {ROLE_LABEL[r]}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => {
                              const isTargetAdmin =
                                m.role === "adminlevel1" ||
                                m.role === "adminlevel2" ||
                                m.role === "adminlevel3";
                              applyRole(m.id, isTargetAdmin);
                            }}
                            disabled={isPending}
                            className="text-[11px] text-emerald-700 font-semibold hover:underline disabled:opacity-50"
                          >
                            ✓
                          </button>
                          <button
                            onClick={() => {
                              setEditingRole(null);
                              setPendingRole(null);
                            }}
                            className="text-[11px] text-slate-500 hover:text-slate-900"
                          >
                            ×
                          </button>
                        </div>
                      ) : (
                        <span
                          className="text-[11px] px-2 py-0.5 rounded font-medium"
                          style={{
                            background: ROLE_COLOR[m.role] + "15",
                            color: ROLE_COLOR[m.role],
                          }}
                        >
                          {ROLE_LABEL[m.role]}
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-slate-600">
                      {m.country ? getCountryLabel(m.country) : "—"}
                    </td>
                    <td className="py-2 px-2 text-slate-500 text-[11px] tabular-nums">
                      {fmtDateTime(m.created_at)}
                    </td>
                    <td className="py-2 pr-4 pl-2 text-right">
                      <div className="flex justify-end gap-2">
                        {(() => {
                          const isTargetAdmin =
                            m.role === "adminlevel1" ||
                            m.role === "adminlevel2" ||
                            m.role === "adminlevel3";
                          // L1 peut editer tout le monde, L2 uniquement les non-admins
                          const showEdit =
                            !isMe &&
                            !editing &&
                            (canEditRole || (canEditTier && !isTargetAdmin));
                          return (
                            showEdit && (
                              <button
                                onClick={() => {
                                  setEditingRole(m.id);
                                  // Si la cible n'est pas dans member/premium/pro et qu'on est L2,
                                  // pre-selectionner "member"
                                  if (
                                    myLevel === 2 &&
                                    !["member", "premium", "pro"].includes(m.role)
                                  ) {
                                    setPendingRole("member");
                                  } else {
                                    setPendingRole(m.role);
                                  }
                                }}
                                className="text-[11px] text-slate-700 hover:text-blue-700"
                              >
                                {canEditRole ? "Rôle" : "Tier"}
                              </button>
                            )
                          );
                        })()}
                        {canDelete && !isMe && (
                          <button
                            onClick={() => {
                              setConfirmDelete(m.id);
                              setDeleteReason("");
                            }}
                            className="text-[11px] text-rose-700 hover:underline"
                          >
                            Supprimer
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal de confirmation suppression */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-5">
            <h3 className="text-base font-semibold text-slate-900">
              Supprimer ce compte ?
            </h3>
            <p className="text-xs text-slate-600 mt-2">
              Cette action est <strong>irréversible</strong>. Toutes les données associées (profil,
              messages, portefeuilles, transactions) seront supprimées en cascade.
            </p>
            <label className="block mt-3 text-[11px] font-medium text-slate-700 uppercase tracking-wide">
              Raison (obligatoire)
            </label>
            <textarea
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              placeholder="Ex : violation des CGU, spam répété, demande utilisateur…"
              className="w-full mt-1 text-sm border border-slate-300 rounded px-2 py-1.5 focus:outline-none focus:border-slate-500"
              rows={3}
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setConfirmDelete(null)}
                className="text-sm px-3 py-1.5 border border-slate-300 rounded hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                onClick={() => executeDelete(confirmDelete)}
                disabled={isPending}
                className="text-sm px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded disabled:opacity-50"
              >
                {isPending ? "Suppression…" : "Confirmer la suppression"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
