"use client";

import { useState } from "react";
import AuthorForm from "./AuthorForm";
import type { Author } from "@/lib/magazine";
import type { AdminMember } from "@/lib/admin/types";

export default function AuthorsManager({
  authors,
  admins,
}: {
  authors: Author[];
  admins: AdminMember[];
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold text-slate-900">
          Auteurs ({authors.length})
        </h2>
        <button
          type="button"
          onClick={() => {
            setShowCreate((v) => !v);
            setEditingId(null);
          }}
          className="text-sm bg-slate-900 hover:bg-slate-700 text-white font-medium px-3 py-1.5 rounded"
        >
          {showCreate ? "Annuler" : "+ Nouvel auteur"}
        </button>
      </div>

      {showCreate && (
        <AuthorForm
          mode="create"
          admins={admins}
          onSaved={() => setShowCreate(false)}
        />
      )}

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {authors.length === 0 ? (
          <div className="text-xs text-slate-400 text-center py-8">
            Aucun auteur pour le moment.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {authors.map((a) => {
              const isEditing = editingId === a.id;
              const linkedAdmin = admins.find((m) => m.id === a.userId);
              return (
                <li key={a.id} className="p-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="w-9 h-9 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-semibold shrink-0">
                      {a.initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-900">
                        {a.name}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {a.title}
                        {linkedAdmin && (
                          <span className="ml-2 text-[10px] text-blue-700">
                            · lié à {linkedAdmin.email}
                          </span>
                        )}
                        {!a.userId && (
                          <span className="ml-2 text-[10px] text-slate-400">
                            · auteur autonome
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(isEditing ? null : a.id);
                        setShowCreate(false);
                      }}
                      className="text-[11px] text-blue-700 hover:underline"
                    >
                      {isEditing ? "Fermer" : "Éditer"}
                    </button>
                  </div>
                  {a.bio && !isEditing && (
                    <div className="text-xs text-slate-600 mt-2 leading-relaxed">
                      {a.bio}
                    </div>
                  )}
                  {isEditing && (
                    <div className="mt-3">
                      <AuthorForm
                        mode="edit"
                        initial={a}
                        admins={admins}
                        onSaved={() => setEditingId(null)}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
