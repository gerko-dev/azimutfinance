"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CountryFlag from "./CountryFlag";
import type { UserRole } from "@/lib/auth/userRole";

type Comparable = {
  date: string;
  maturiteMois: number;
  marginal: number;
  moyenPondere: number;
  couverture: number | null;
  absorption: number;
  url: string;
};

type Repere = {
  rendement: number;
  prix: number;
  tauxPrecompte: number | null;
};

type Resultat = {
  comparables: Comparable[];
  bandeMois: [number, number];
  repereMarginal: Repere | null;
  repereMoyen: Repere | null;
  couvertureMoyenne: number | null;
  avertissements: string[];
};

type EmissionAnnoncee = {
  pays: string;
  paysCode: string;
  dateOperation: string;
  montantM: number;
  url: string;
};

type Props = {
  pays: Array<{ code: string; nom: string }>;
  annonces: EmissionAnnoncee[];
  userRole: UserRole;
};

const MATURITES_BAT = [1, 3, 6, 12, 24];
const MATURITES_OAT = [36, 60, 84, 120, 180];

function pct(v: number, d = 2): string {
  return (v * 100).toFixed(d).replace(".", ",") + " %";
}
function fcfa(v: number, d = 0): string {
  return v.toLocaleString("fr-FR", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}
function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

export default function SovereignAuctionSimulator({
  pays,
  annonces,
  userRole,
}: Props) {
  const isPremium = userRole === "premium" || userRole === "pro";

  const [paysCode, setPaysCode] = useState(pays[0]?.code ?? "CI");
  const [instrument, setInstrument] = useState<"BAT" | "OAT">("OAT");
  const [amortissement, setAmortissement] = useState<"In Fine" | "Linéaire">(
    "In Fine",
  );

  // Les champs chiffres sont tenus en TEXTE, pas en nombre.
  //
  // Un etat numerique force a convertir a chaque frappe, et Number("") vaut 0 :
  // le repli habituel « Number(v) || 36 » reecrivait donc 36 dans la case des
  // qu'on l'effacait, si bien qu'on ne pouvait jamais la vider pour retaper une
  // valeur. Le texte est garde tel quel ; la conversion, et son repli, n'ont
  // lieu qu'au moment de calculer.
  const [maturiteTxt, setMaturiteTxt] = useState("36");
  const [couponTxt, setCouponTxt] = useState("6,5");
  const [differeTxt, setDiffereTxt] = useState("0");
  const [montantTxt, setMontantTxt] = useState("500");

  /** Lit un champ, virgule decimale acceptee. Null si vide ou illisible. */
  const lire = (txt: string): number | null => {
    const v = Number(txt.trim().replace(",", "."));
    return txt.trim() !== "" && Number.isFinite(v) ? v : null;
  };

  const maturiteMois = lire(maturiteTxt);
  const couponPct = lire(couponTxt);
  const differeAnnees = lire(differeTxt);
  const montantVise = lire(montantTxt);

  const [res, setRes] = useState<Resultat | null>(null);
  const [charge, setCharge] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // Un changement d'instrument change le gisement de maturites : on repose une
  // valeur plausible plutot que de demander 36 mois de BAT.
  const changerInstrument = useCallback((i: "BAT" | "OAT") => {
    setInstrument(i);
    setMaturiteTxt(i === "BAT" ? "6" : "36");
  }, []);

  // Une maturite vide ne definit aucun titre : on ne lance rien et on garde le
  // dernier resultat a l'ecran plutot que de le vider pendant la saisie. Le
  // coupon et le differe, eux, ont un repli neutre.
  const demande = useMemo(
    () =>
      maturiteMois !== null && maturiteMois > 0
        ? {
            pays: paysCode,
            instrument,
            maturiteMois,
            couponPct: instrument === "OAT" ? (couponPct ?? 0) : null,
            amortissement,
            differeAnnees: differeAnnees ?? 0,
          }
        : null,
    [paysCode, instrument, maturiteMois, couponPct, amortissement, differeAnnees],
  );

  const dernierAppel = useRef(0);
  useEffect(() => {
    if (!isPremium || demande === null) return;
    const jeton = ++dernierAppel.current;
    const t = setTimeout(() => {
      setCharge(true);
      fetch("/api/adjudication-simulateur", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(demande),
      })
        .then((r) =>
          r.ok ? r.json() : Promise.reject(new Error(String(r.status))),
        )
        .then((d) => {
          // Une reponse arrivee apres une saisie plus recente est jetee : sans
          // ce garde, une requete lente ecraserait un resultat a jour.
          if (jeton !== dernierAppel.current) return;
          setRes(d);
          setErreur(null);
        })
        .catch(() => {
          if (jeton !== dernierAppel.current) return;
          setErreur("Le calcul n'a pas abouti.");
        })
        .finally(() => {
          if (jeton === dernierAppel.current) setCharge(false);
        });
    }, 250);
    return () => clearTimeout(t);
  }, [demande, isPremium]);

  const coupure = instrument === "BAT" ? 1_000_000 : 10_000;
  const nbTitres =
    res?.repereMarginal && montantVise !== null && montantVise > 0
      ? Math.floor((montantVise * 1_000_000) / res.repereMarginal.prix)
      : 0;

  if (!isPremium) {
    return (
      <section className="bg-white rounded-lg border border-slate-200 p-6 md:p-8 text-center">
        <h2 className="text-lg md:text-xl font-semibold mb-2">
          Repère de soumission
        </h2>
        <p className="text-sm text-slate-600 max-w-2xl mx-auto">
          À quel prix soumissionner pour être retenu ? L&apos;outil reprend les
          cinq dernières émissions comparables de l&apos;émetteur et en déduit
          le prix à ne pas dépasser.
        </p>
        <p className="text-xs text-slate-500 mt-3">Réservé aux abonnés.</p>
      </section>
    );
  }

  return (
    <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-4">
        <div>
          <h2 className="text-lg md:text-xl font-semibold">
            Repère de soumission
          </h2>
          <p className="text-xs md:text-sm text-slate-600 mt-1">
            À quel prix soumissionner pour être retenu.
          </p>
        </div>
        <span className="text-[10px] md:text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">
          EXCLUSIVITÉ AZIMUT
        </span>
      </div>

      {/* ---------- SEANCES ANNONCEES ---------- */}
      {annonces.length > 0 && (
        <div className="mb-4">
          <span className="text-[10px] uppercase tracking-wide text-slate-500 font-medium">
            Prochaines séances annoncées
          </span>
          <div className="flex flex-wrap gap-2 mt-1.5">
            {annonces.map((a, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setPaysCode(a.paysCode)}
                className={`text-xs px-2.5 py-1.5 rounded-md border transition inline-flex items-center gap-1.5 ${
                  paysCode === a.paysCode
                    ? "border-blue-500 bg-blue-50 text-blue-800"
                    : "border-slate-300 hover:bg-slate-50"
                }`}
                title={`${a.montantM.toLocaleString("fr-FR")} M FCFA recherchés`}
              >
                <CountryFlag country={a.paysCode} size={13} />
                {a.pays}
                <span className="text-slate-500">
                  {fmtDate(a.dateOperation)}
                </span>
              </button>
            ))}
          </div>
          <p className="text-[11px] text-slate-500 mt-1.5">
            UMOA-Titres n&apos;annonce à ce stade que l&apos;émetteur, la date et
            l&apos;enveloppe. Les caractéristiques des titres paraissent à
            l&apos;avis d&apos;émission : renseignez-les ci-dessous.
          </p>
        </div>
      )}

      {/* ---------- PARAMETRES ---------- */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
        <div>
          <label className="block text-[10px] uppercase tracking-wide text-slate-500 mb-1 font-medium">
            Émetteur
          </label>
          <select
            value={paysCode}
            onChange={(e) => setPaysCode(e.target.value)}
            className="w-full text-sm px-2 py-1.5 border border-slate-300 rounded-md focus:border-blue-500 focus:outline-none"
          >
            {pays.map((p) => (
              <option key={p.code} value={p.code}>
                {p.nom}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[10px] uppercase tracking-wide text-slate-500 mb-1 font-medium">
            Instrument
          </label>
          <div className="inline-flex rounded-md bg-slate-100 p-0.5 text-xs w-full">
            {(["BAT", "OAT"] as const).map((i) => (
              <button
                key={i}
                type="button"
                onClick={() => changerInstrument(i)}
                className={`flex-1 px-2 py-1 rounded transition ${
                  instrument === i
                    ? "bg-white shadow-sm font-medium"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {i}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-[10px] uppercase tracking-wide text-slate-500 mb-1 font-medium">
            Maturité (mois)
          </label>
          <input
            type="text"
            inputMode="numeric"
            value={maturiteTxt}
            onChange={(e) => setMaturiteTxt(e.target.value)}
            aria-invalid={maturiteMois === null || maturiteMois <= 0}
            className={`w-full text-sm px-2 py-1.5 border rounded-md focus:outline-none tabular-nums ${
              maturiteMois === null || maturiteMois <= 0
                ? "border-amber-400 focus:border-amber-500"
                : "border-slate-300 focus:border-blue-500"
            }`}
          />
          <div className="flex gap-1 mt-1">
            {(instrument === "BAT" ? MATURITES_BAT : MATURITES_OAT).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMaturiteTxt(String(m))}
                className={`text-[10px] px-1.5 py-0.5 rounded border transition ${
                  maturiteMois === m
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-slate-200 text-slate-500 hover:bg-slate-50"
                }`}
              >
                {m < 12 ? `${m}m` : `${m / 12}a`}
              </button>
            ))}
          </div>
        </div>

        {instrument === "OAT" && (
          <>
            <div>
              <label className="block text-[10px] uppercase tracking-wide text-slate-500 mb-1 font-medium">
                Coupon (%)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={couponTxt}
                onChange={(e) => setCouponTxt(e.target.value)}
                className="w-full text-sm px-2 py-1.5 border border-slate-300 rounded-md focus:border-blue-500 focus:outline-none tabular-nums"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wide text-slate-500 mb-1 font-medium">
                Amortissement
              </label>
              <select
                value={amortissement}
                onChange={(e) =>
                  setAmortissement(e.target.value as "In Fine" | "Linéaire")
                }
                className="w-full text-sm px-2 py-1.5 border border-slate-300 rounded-md focus:border-blue-500 focus:outline-none"
              >
                <option value="In Fine">In fine</option>
                <option value="Linéaire">Linéaire</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wide text-slate-500 mb-1 font-medium">
                Différé (ans)
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={differeTxt}
                onChange={(e) => setDiffereTxt(e.target.value)}
                disabled={amortissement !== "Linéaire"}
                className="w-full text-sm px-2 py-1.5 border border-slate-300 rounded-md focus:border-blue-500 focus:outline-none tabular-nums disabled:bg-slate-50 disabled:text-slate-400"
              />
            </div>
          </>
        )}

        <div>
          <label className="block text-[10px] uppercase tracking-wide text-slate-500 mb-1 font-medium">
            Montant visé (M)
          </label>
          <input
            type="text"
            inputMode="numeric"
            value={montantTxt}
            onChange={(e) => setMontantTxt(e.target.value)}
            className="w-full text-sm px-2 py-1.5 border border-slate-300 rounded-md focus:border-blue-500 focus:outline-none tabular-nums"
          />
        </div>
      </div>

      {erreur && (
        <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">
          {erreur}
        </p>
      )}

      {res && !res.repereMarginal && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          {res.avertissements[0]}
        </p>
      )}

      {res && res.repereMarginal && res.repereMoyen && (
        <div className={charge ? "opacity-60 transition" : "transition"}>
          {/* ---------- LES DEUX REPERES ---------- */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
            <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4">
              <div className="text-[10px] uppercase tracking-wide text-blue-800 font-medium mb-1">
                Prix limite — moyenne des taux marginaux
              </div>
              <div className="text-3xl font-semibold tabular-nums text-blue-900">
                {fcfa(res.repereMarginal.prix, 2)}
              </div>
              <div className="text-xs text-slate-600 mt-1">
                par coupure de {fcfa(coupure)} FCFA · rendement{" "}
                {pct(res.repereMarginal.rendement, 3)}
                {res.repereMarginal.tauxPrecompte !== null && (
                  <>
                    {" "}
                    · taux précompté{" "}
                    <span className="font-medium">
                      {pct(res.repereMarginal.tauxPrecompte, 3)}
                    </span>
                  </>
                )}
              </div>
              <p className="text-[11px] text-slate-500 mt-2 leading-snug">
                Au-delà de ce rendement, soit en dessous de ce prix, les
                soumissions n&apos;étaient pas servies lors des cinq dernières
                séances comparables.
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 p-4">
              <div className="text-[10px] uppercase tracking-wide text-slate-500 font-medium mb-1">
                Prix médian du marché — moyenne des rendements moyens pondérés
              </div>
              <div className="text-3xl font-semibold tabular-nums">
                {fcfa(res.repereMoyen.prix, 2)}
              </div>
              <div className="text-xs text-slate-600 mt-1">
                rendement {pct(res.repereMoyen.rendement, 3)}
                {res.repereMoyen.tauxPrecompte !== null && (
                  <>
                    {" "}
                    · taux précompté {pct(res.repereMoyen.tauxPrecompte, 3)}
                  </>
                )}
              </div>
              <p className="text-[11px] text-slate-500 mt-2 leading-snug">
                Ce qu&apos;a payé en moyenne l&apos;ensemble des servis.
                Soumissionner ici, c&apos;est se placer au milieu du carnet
                plutôt qu&apos;à sa limite —{" "}
                {Math.round(
                  (res.repereMarginal.rendement - res.repereMoyen.rendement) *
                    10000,
                )}{" "}
                pb de marge sur le prix limite.
              </p>
            </div>
          </div>

          {/* ---------- SYNTHESE ---------- */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5 text-xs">
            <Info
              label="Émissions retenues"
              valeur={`${res.comparables.length}`}
              detail={`maturités ${res.bandeMois[0]}–${res.bandeMois[1]} mois`}
            />
            <Info
              label="Titres au prix limite"
              valeur={nbTitres.toLocaleString("fr-FR")}
              detail={
                montantVise !== null
                  ? `pour ${montantVise.toLocaleString("fr-FR")} M FCFA`
                  : "montant à renseigner"
              }
            />
            <Info
              label="Couverture moyenne"
              valeur={
                res.couvertureMoyenne !== null
                  ? `${res.couvertureMoyenne.toFixed(2).replace(".", ",")}×`
                  : "—"
              }
              detail="soumis / recherché"
            />
            <Info
              label="Dernière séance"
              valeur={fmtDate(res.comparables[0].date)}
              detail={`marginal ${pct(res.comparables[0].marginal)}`}
            />
          </div>

          {res.avertissements.length > 0 && (
            <ul className="mb-4 space-y-1">
              {res.avertissements.map((a, i) => (
                <li
                  key={i}
                  className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2"
                >
                  {a}
                </li>
              ))}
            </ul>
          )}

          {/* ---------- LES CINQ EMISSIONS ---------- */}
          <h3 className="text-sm font-medium mb-2">
            Les {res.comparables.length} dernières émissions comparables
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead className="text-slate-500 text-xs">
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 font-medium">Date</th>
                  <th className="text-right py-2 font-medium">Maturité</th>
                  <th className="text-right py-2 font-medium">Taux marginal</th>
                  <th className="text-right py-2 font-medium">
                    Rendement moyen pondéré
                  </th>
                  <th className="text-right py-2 font-medium">Écart</th>
                  <th className="text-right py-2 font-medium hidden md:table-cell">
                    Couverture
                  </th>
                  <th className="text-right py-2 font-medium hidden md:table-cell">
                    Absorption
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {res.comparables.map((c, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="py-2">
                      {c.url ? (
                        <a
                          href={c.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800"
                        >
                          {fmtDate(c.date)}
                        </a>
                      ) : (
                        fmtDate(c.date)
                      )}
                    </td>
                    <td className="py-2 text-right text-slate-500">
                      {c.maturiteMois} mois
                    </td>
                    <td className="py-2 text-right font-medium">
                      {pct(c.marginal, 3)}
                    </td>
                    <td className="py-2 text-right">
                      {pct(c.moyenPondere, 3)}
                    </td>
                    <td className="py-2 text-right text-slate-500">
                      {Math.round((c.marginal - c.moyenPondere) * 10000)} pb
                    </td>
                    <td className="py-2 text-right text-slate-500 hidden md:table-cell">
                      {c.couverture !== null
                        ? `${c.couverture.toFixed(2).replace(".", ",")}×`
                        : "—"}
                    </td>
                    <td className="py-2 text-right text-slate-500 hidden md:table-cell">
                      {(c.absorption * 100).toFixed(0)} %
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 font-medium">
                  <td className="py-2">Moyenne</td>
                  <td />
                  <td className="py-2 text-right text-blue-800">
                    {pct(res.repereMarginal.rendement, 3)}
                  </td>
                  <td className="py-2 text-right">
                    {pct(res.repereMoyen.rendement, 3)}
                  </td>
                  <td className="py-2 text-right text-slate-500">
                    {Math.round(
                      (res.repereMarginal.rendement -
                        res.repereMoyen.rendement) *
                        10000,
                    )}{" "}
                    pb
                  </td>
                  <td className="hidden md:table-cell" />
                  <td className="hidden md:table-cell" />
                </tr>
              </tfoot>
            </table>
          </div>

          <p className="text-xs text-slate-500 mt-4 leading-relaxed">
            L&apos;adjudication est « à la française » : les soumissions sont
            servies de la plus offrante à la moins offrante jusqu&apos;à
            épuisement du montant retenu, et la dernière servie fixe le taux
            marginal. On est retenu si son rendement ne dépasse pas ce marginal.
            Les taux ci-dessus sont ramenés au même rendement actuariel
            post-compté : les OAT publient un prix marginal, les BAT un taux
            précompté, qui ne se comparent pas en l&apos;état. Une moyenne sur
            cinq séances ne prédit pas la prochaine — elle situe le niveau
            récent.
          </p>
        </div>
      )}

      {!res && !erreur && (
        <div className="h-32 flex items-center justify-center text-sm text-slate-400">
          Calcul en cours…
        </div>
      )}
    </section>
  );
}

function Info({
  label,
  valeur,
  detail,
}: {
  label: string;
  valeur: string;
  detail: string;
}) {
  return (
    <div className="rounded-md border border-slate-200 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500 font-medium">
        {label}
      </div>
      <div className="text-base font-semibold tabular-nums">{valeur}</div>
      <div className="text-[10px] text-slate-500 leading-tight">{detail}</div>
    </div>
  );
}
