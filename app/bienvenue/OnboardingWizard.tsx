"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import {
  saveOnboardingStepAction,
  skipOnboardingAction,
} from "@/lib/onboarding/actions";
import {
  COUNTRIES,
  EXPERIENCE_LEVELS,
  HORIZONS,
  INTERESTS,
  PROFESSIONAL_SECTORS,
  type CountryCode,
  type ExperienceLevel,
  type Horizon,
  type Interest,
  type ProfileExtras,
} from "@/lib/onboarding/types";

const TOTAL_STEPS = 4;

const STEP_LABEL: Record<number, string> = {
  1: "Pays",
  2: "Niveau",
  3: "Intérêts",
  4: "Horizon",
};

export default function OnboardingWizard({
  initial,
  firstName,
  isEditMode,
}: {
  initial: ProfileExtras;
  firstName: string | null;
  isEditMode: boolean;
}) {
  const router = useRouter();

  // Etape courante : commence a 1, ou avance si reponses partielles deja la.
  const initialStep = computeInitialStep(initial);
  const [step, setStep] = useState<number>(initialStep);

  // Selection locale par etape (les server actions confirment la valeur).
  const [country, setCountry] = useState<CountryCode | null>(initial.country);
  const [experience, setExperience] = useState<ExperienceLevel | null>(
    initial.experience_level
  );
  const [sector, setSector] = useState<string | null>(initial.professional_sector);
  const [interests, setInterests] = useState<Interest[]>(
    (initial.interests ?? []) as Interest[]
  );
  const [horizon, setHorizon] = useState<Horizon | null>(initial.investment_horizon);

  const [error, setError] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();

  // Wrapper qui appelle la server action puis met a jour l'etape ou navigue
  // selon le resultat. Evite le pattern useActionState + useEffect, interdit
  // par la regle react-hooks/set-state-in-effect (React 19).
  function handleSubmit(formData: FormData) {
    startSubmit(async () => {
      const res = await saveOnboardingStepAction(null, formData);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setError(null);
      // En mode edition : on revient au compte des qu'une etape est sauvee.
      // Sinon : on enchaine les etapes jusqu'a la fin du wizard.
      if (isEditMode || res?.done) {
        router.push("/compte");
        router.refresh();
      } else if (res?.step) {
        setStep(res.step);
      }
    });
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 md:p-8 shadow-sm">
      {/* En-tete */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-slate-900">
            {isEditMode
              ? "Modifier mon profil"
              : `Bienvenue${firstName ? `, ${firstName}` : ""} 👋`}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {isEditMode
              ? "Mets à jour les réponses que tu souhaites changer."
              : "En 4 questions rapides, on personnalise ton expérience."}
          </p>
        </div>
        {isEditMode ? (
          <Link
            href="/compte"
            className="text-xs text-slate-500 hover:text-slate-800 underline underline-offset-2 whitespace-nowrap"
          >
            Annuler
          </Link>
        ) : (
          <form action={skipOnboardingAction}>
            <SkipButton />
          </form>
        )}
      </div>

      {/* Barre de progression : seulement pour l'onboarding initial. */}
      {!isEditMode && (
        <div className="mb-8">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span>Étape {step} sur {TOTAL_STEPS}</span>
            <span>{Math.round(((step - 1) / TOTAL_STEPS) * 100)}%</span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-700 transition-all duration-300"
              style={{ width: `${((step - 1) / TOTAL_STEPS) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Onglets de navigation : uniquement en mode edition pour aller
          directement a la question qu'on veut modifier. */}
      {isEditMode && (
        <div className="flex flex-wrap gap-1.5 mb-6 pb-4 border-b border-slate-100">
          {[1, 2, 3, 4].map((n) => {
            const active = step === n;
            return (
              <button
                key={n}
                type="button"
                onClick={() => {
                  setError(null);
                  setStep(n);
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
                  active
                    ? "bg-blue-700 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {STEP_LABEL[n]}
              </button>
            );
          })}
        </div>
      )}

      {/* Contenu de l'etape */}
      <form action={handleSubmit} className="space-y-6">
        <input type="hidden" name="step" value={step} />

        {step === 1 && (
          <StepCountry value={country} onChange={setCountry} />
        )}

        {step === 2 && (
          <StepExperience
            value={experience}
            sector={sector}
            onChange={setExperience}
            onSectorChange={setSector}
          />
        )}

        {step === 3 && (
          <StepInterests value={interests} onChange={setInterests} />
        )}

        {step === 4 && <StepHorizon value={horizon} onChange={setHorizon} />}

        {error && (
          <div className="px-3 py-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md">
            {error}
          </div>
        )}

        <NavBar
          step={step}
          submitting={submitting}
          isEditMode={isEditMode}
          canContinue={
            (step === 1 && !!country) ||
            (step === 2 && !!experience) ||
            (step === 3 && interests.length > 0) ||
            (step === 4 && !!horizon)
          }
          onBack={() => setStep((s) => Math.max(1, s - 1))}
        />
      </form>
    </div>
  );
}

function computeInitialStep(p: ProfileExtras): number {
  if (!p.country) return 1;
  if (!p.experience_level) return 2;
  if (!p.interests || p.interests.length === 0) return 3;
  if (!p.investment_horizon) return 4;
  return 4;
}

// ----------------------------------------------------------------
// Sous-composants : un par etape
// ----------------------------------------------------------------

function StepCountry({
  value,
  onChange,
}: {
  value: CountryCode | null;
  onChange: (c: CountryCode) => void;
}) {
  return (
    <div>
      <h2 className="text-lg font-medium text-slate-900 mb-1">
        Dans quel pays vis-tu ?
      </h2>
      <p className="text-sm text-slate-500 mb-4">
        On adapte les contenus, devises et fiscalité affichés.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {COUNTRIES.map((c) => {
          const selected = value === c.code;
          return (
            <button
              key={c.code}
              type="button"
              onClick={() => onChange(c.code)}
              className={`flex flex-col items-center justify-center gap-1.5 p-3 border rounded-lg text-sm transition ${
                selected
                  ? "border-blue-700 bg-blue-50 text-blue-900"
                  : "border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700"
              }`}
            >
              <span className="text-2xl leading-none">{c.flag}</span>
              <span className="text-xs text-center leading-tight">{c.label}</span>
            </button>
          );
        })}
      </div>
      {value && <input type="hidden" name="country" value={value} />}
    </div>
  );
}

function StepExperience({
  value,
  sector,
  onChange,
  onSectorChange,
}: {
  value: ExperienceLevel | null;
  sector: string | null;
  onChange: (e: ExperienceLevel) => void;
  onSectorChange: (s: string | null) => void;
}) {
  return (
    <div>
      <h2 className="text-lg font-medium text-slate-900 mb-1">
        Comment décrirais-tu ton niveau ?
      </h2>
      <p className="text-sm text-slate-500 mb-4">
        Pour ajuster le ton et la profondeur des analyses.
      </p>
      <div className="space-y-2">
        {EXPERIENCE_LEVELS.map((lvl) => {
          const selected = value === lvl.code;
          return (
            <button
              key={lvl.code}
              type="button"
              onClick={() => {
                onChange(lvl.code);
                if (lvl.code !== "expert") onSectorChange(null);
              }}
              className={`w-full text-left p-4 border rounded-lg transition ${
                selected
                  ? "border-blue-700 bg-blue-50"
                  : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <div className={`font-medium text-sm ${selected ? "text-blue-900" : "text-slate-900"}`}>
                {lvl.label}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">{lvl.description}</div>
            </button>
          );
        })}
      </div>

      {value === "expert" && (
        <div className="mt-5 p-4 bg-slate-50 border border-slate-200 rounded-lg">
          <label htmlFor="professional_sector" className="block text-sm font-medium text-slate-800 mb-2">
            Dans quel secteur travailles-tu ?
            <span className="text-slate-400 font-normal"> (optionnel)</span>
          </label>
          <select
            id="professional_sector"
            name="professional_sector"
            value={sector ?? ""}
            onChange={(e) => onSectorChange(e.target.value || null)}
            className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">— Choisir —</option>
            {PROFESSIONAL_SECTORS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      )}

      {value && <input type="hidden" name="experience_level" value={value} />}
    </div>
  );
}

function StepInterests({
  value,
  onChange,
}: {
  value: Interest[];
  onChange: (next: Interest[]) => void;
}) {
  function toggle(code: Interest) {
    if (value.includes(code)) {
      onChange(value.filter((v) => v !== code));
    } else {
      onChange([...value, code]);
    }
  }

  return (
    <div>
      <h2 className="text-lg font-medium text-slate-900 mb-1">
        Qu&apos;est-ce qui t&apos;intéresse le plus&nbsp;?
      </h2>
      <p className="text-sm text-slate-500 mb-4">
        Choisis-en au moins un — tu peux en sélectionner plusieurs.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {INTERESTS.map((i) => {
          const selected = value.includes(i.code);
          return (
            <button
              key={i.code}
              type="button"
              onClick={() => toggle(i.code)}
              className={`flex items-center gap-3 p-3 border rounded-lg text-sm transition text-left ${
                selected
                  ? "border-blue-700 bg-blue-50 text-blue-900"
                  : "border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700"
              }`}
            >
              <span className="text-xl">{i.icon}</span>
              <span className="font-medium">{i.label}</span>
              {selected && (
                <svg
                  className="ml-auto w-4 h-4 text-blue-700"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden
                >
                  <path
                    fillRule="evenodd"
                    d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0L3.3 9.7a1 1 0 011.4-1.4L8.5 12l6.8-6.8a1 1 0 011.4 0z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </button>
          );
        })}
      </div>
      {value.map((code) => (
        <input key={code} type="hidden" name="interests" value={code} />
      ))}
    </div>
  );
}

function StepHorizon({
  value,
  onChange,
}: {
  value: Horizon | null;
  onChange: (h: Horizon) => void;
}) {
  return (
    <div>
      <h2 className="text-lg font-medium text-slate-900 mb-1">
        Sur quel horizon investis-tu ?
      </h2>
      <p className="text-sm text-slate-500 mb-4">
        On hiérarchisera les recommandations en conséquence.
      </p>
      <div className="space-y-2">
        {HORIZONS.map((h) => {
          const selected = value === h.code;
          return (
            <button
              key={h.code}
              type="button"
              onClick={() => onChange(h.code)}
              className={`w-full flex items-center justify-between p-4 border rounded-lg transition ${
                selected
                  ? "border-blue-700 bg-blue-50"
                  : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <div className="text-left">
                <div className={`font-medium text-sm ${selected ? "text-blue-900" : "text-slate-900"}`}>
                  {h.label}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">{h.description}</div>
              </div>
            </button>
          );
        })}
      </div>
      {value && <input type="hidden" name="investment_horizon" value={value} />}
    </div>
  );
}

function SkipButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-xs text-slate-500 hover:text-slate-800 underline underline-offset-2 disabled:opacity-50 whitespace-nowrap"
    >
      Plus tard
    </button>
  );
}

function NavBar({
  step,
  canContinue,
  submitting,
  isEditMode,
  onBack,
}: {
  step: number;
  canContinue: boolean;
  submitting: boolean;
  isEditMode: boolean;
  onBack: () => void;
}) {
  const submitLabel = submitting
    ? "..."
    : isEditMode
    ? "Enregistrer"
    : step < TOTAL_STEPS
    ? "Continuer"
    : "Terminer";

  return (
    <div className="flex items-center justify-between pt-4 border-t border-slate-100">
      {isEditMode ? (
        <span />
      ) : (
        <button
          type="button"
          onClick={onBack}
          disabled={step === 1 || submitting}
          className="text-sm text-slate-600 hover:text-slate-900 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          ← Retour
        </button>
      )}
      <button
        type="submit"
        disabled={!canContinue || submitting}
        className="px-5 py-2 text-sm font-medium bg-blue-700 text-white rounded-md hover:bg-blue-800 disabled:bg-slate-300 disabled:cursor-not-allowed"
      >
        {submitLabel}
      </button>
    </div>
  );
}
