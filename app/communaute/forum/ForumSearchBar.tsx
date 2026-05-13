"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ForumSearchBar({
  initialQuery,
}: {
  initialQuery?: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState(initialQuery ?? "");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = q.trim();
    if (!trimmed) {
      router.push("/communaute/forum");
      return;
    }
    router.push(
      `/communaute/forum/recherche?q=${encodeURIComponent(trimmed)}`,
    );
  }

  return (
    <form onSubmit={submit} className="flex gap-2">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Rechercher dans le forum (ex : SNTS, courbe taux, FCP...)…"
        className="flex-1 text-sm border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 bg-white"
      />
      <button
        type="submit"
        className="px-4 py-2 rounded-md text-sm font-medium bg-slate-900 text-white hover:bg-slate-800"
      >
        Rechercher
      </button>
    </form>
  );
}
