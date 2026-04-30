"use client";

import Link from "next/link";
import CountryFlag from "@/components/CountryFlag";
import { MACRO_COUNTRIES, type MacroCountryCode } from "@/lib/macroTypes";

export default function MacroCountrySelector({
  selected,
  basePath = "/macro/pays",
  preserveParams,
}: {
  selected: MacroCountryCode;
  basePath?: string;
  preserveParams?: Record<string, string | undefined>;
}) {
  function buildHref(code: MacroCountryCode): string {
    const params = new URLSearchParams();
    params.set("pays", code);
    if (preserveParams) {
      for (const [k, v] of Object.entries(preserveParams)) {
        if (k !== "pays" && v) params.set(k, v);
      }
    }
    return `${basePath}?${params.toString()}`;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {MACRO_COUNTRIES.map((c) => {
        const active = c.code === selected;
        return (
          <Link
            key={c.code}
            href={buildHref(c.code)}
            scroll={false}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border transition ${
              active
                ? "bg-blue-700 text-white border-blue-700 shadow-sm"
                : "bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
            }`}
          >
            <CountryFlag country={c.code === "UMOA" ? "UEMOA" : c.code} size={14} />
            <span>{c.shortName}</span>
          </Link>
        );
      })}
    </div>
  );
}
