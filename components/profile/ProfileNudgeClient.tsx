"use client";

import { useState, useTransition } from "react";
import { answerNudgeAction, dismissNudgeAction } from "@/lib/onboarding/actions";
import type { NudgeField } from "@/lib/onboarding/types";

type Option = { value: string; label: string; icon?: string };

export default function ProfileNudgeClient({
  field,
  revalidate,
  title,
  multi,
  options,
}: {
  field: NudgeField;
  revalidate: string;
  title: string;
  multi: boolean;
  options: Option[];
}) {
  const [hidden, setHidden] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  if (hidden) return null;

  function toggle(v: string) {
    if (multi) {
      setSelected((s) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v]));
    } else {
      // Single-choice : on envoie immediatement.
      const fd = new FormData();
      fd.set("field", field);
      fd.set("value", v);
      fd.set("revalidate", revalidate);
      startTransition(async () => {
        await answerNudgeAction(fd);
        setHidden(true);
      });
    }
  }

  function submitMulti() {
    if (selected.length === 0) return;
    const fd = new FormData();
    fd.set("field", field);
    selected.forEach((v) => fd.append("value", v));
    fd.set("revalidate", revalidate);
    startTransition(async () => {
      await answerNudgeAction(fd);
      setHidden(true);
    });
  }

  function dismiss() {
    const fd = new FormData();
    fd.set("field", field);
    fd.set("revalidate", revalidate);
    startTransition(async () => {
      await dismissNudgeAction(fd);
      setHidden(true);
    });
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-4">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-blue-900 mb-2">{title}</div>
          <div className="flex flex-wrap gap-1.5">
            {options.map((opt) => {
              const isSel = selected.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggle(opt.value)}
                  disabled={pending}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full border transition disabled:opacity-50 ${
                    isSel
                      ? "border-blue-700 bg-blue-700 text-white"
                      : "border-blue-300 bg-white text-blue-800 hover:bg-blue-100"
                  }`}
                >
                  {opt.icon && <span>{opt.icon}</span>}
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
          {multi && (
            <div className="mt-2.5 flex items-center gap-2">
              <button
                type="button"
                onClick={submitMulti}
                disabled={pending || selected.length === 0}
                className="px-3 py-1 text-xs font-medium bg-blue-700 text-white rounded-md hover:bg-blue-800 disabled:bg-slate-300"
              >
                Valider
              </button>
              <span className="text-xs text-blue-700">
                {selected.length} sélectionné{selected.length > 1 ? "s" : ""}
              </span>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          disabled={pending}
          aria-label="Fermer"
          className="text-blue-400 hover:text-blue-700 p-1 -m-1 disabled:opacity-50"
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M4.3 4.3a1 1 0 011.4 0L10 8.6l4.3-4.3a1 1 0 111.4 1.4L11.4 10l4.3 4.3a1 1 0 01-1.4 1.4L10 11.4l-4.3 4.3a1 1 0 01-1.4-1.4L8.6 10 4.3 5.7a1 1 0 010-1.4z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
