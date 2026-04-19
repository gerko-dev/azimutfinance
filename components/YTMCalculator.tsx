"use client";

import { useState, useMemo, useEffect } from "react";
import {
  countryNames,
  getAvailableCountries,
  type Bond,
  type BondCountry,
  type IssuanceResult,
} from "@/lib/bondsUEMOA";
import {
  calculateFullBondPricing,
  parseDate,
  formatDateISO,
} from "@/lib/bondMath";
import BondSearchSelect from "./BondSearchSelect";

// === HELPERS DE FORMATAGE ===
function formatFCFA(value: number): string {
  return Math.round(value).toLocaleString("fr-FR").replace(/,/g, " ");
}

function formatFCFA2(value: number): string {
  return value
    .toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .replace(/,/g, "X")
    .replace(/\./g, ",")
    .replace(/X/g, " ");
}

function formatDateFR(date: Date): string {
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

type Props = {
  bonds: Bond[];
  issuances: IssuanceResult[];
};

export default function YTMCalculator({ bonds, issuances }: Props) {
  // === ETATS (calcules une fois, stables) ===
  const availableCountries = useMemo(() => getAvailableCountries(bonds), [bonds]);

  const [selectedCountry, setSelectedCountry] = useState<BondCountry>(
    availableCountries[0] || "CI"
  );
  const [selectedIsin, setSelectedIsin] = useState<string>("");
  const [operationDateStr, setOperationDateStr] = useState<string>(
    formatDateISO(new Date())
  );
  const [numberOfBonds, setNumberOfBonds] = useState<number>(100);
  const [userCleanPrice, setUserCleanPrice] = useState<number>(10000);

  // === FILTRAGE PAR PAYS (strict, inline pour robustesse) ===
  const availableBonds = useMemo(() => {
    return bonds.filter((b) => b.country === selectedCountry);
  }, [selectedCountry, bonds]);

  // === Reset ISIN quand la liste filtree change ===
  useEffect(() => {
    if (availableBonds.length > 0) {
      // Si l'ISIN actuel n'est plus dans la liste, prendre le premier
      const currentStillValid = availableBonds.some((b) => b.isin === selectedIsin);
      if (!currentStillValid) {
        setSelectedIsin(availableBonds[0].isin);
      }
    } else {
      setSelectedIsin("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableBonds]);

  // === OBLIGATION SELECTIONNEE ===
  const selectedBond = useMemo(() => {
    if (!selectedIsin) return undefined;
    return availableBonds.find((b) => b.isin === selectedIsin);
  }, [selectedIsin, availableBonds]);

  // === Prix par defaut = nominal ===
  useEffect(() => {
    if (selectedBond) {
      setUserCleanPrice(selectedBond.nominalValue);
    }
  }, [selectedBond]);

  // === CALCUL COMPLET ===
  const result = useMemo(() => {
    if (!selectedBond || userCleanPrice <= 0 || numberOfBonds <= 0) {
      return null;
    }

    const operationDate = parseDate(operationDateStr);
    const maturityDate = parseDate(selectedBond.maturityDate);
    const issueDate = parseDate(selectedBond.issueDate);

    if (operationDate.getTime() < issueDate.getTime()) {
      return { error: "La date d'opération doit être après l'émission" };
    }
    if (operationDate.getTime() >= maturityDate.getTime()) {
      return { error: "La date d'opération doit être avant l'échéance" };
    }

    try {
      const r = calculateFullBondPricing(
        selectedBond,
        operationDate,
        numberOfBonds,
        userCleanPrice,
        issuances
      );
      return { data: r };
    } catch {
      return { error: "Erreur de calcul" };
    }
  }, [selectedBond, operationDateStr, numberOfBonds, userCleanPrice, issuances]);

  const data = result && "data" in result ? result.data : null;
  const error = result && "error" in result ? result.error : null;

  return (
    <div className="space-y-4 md:space-y-6">
      {/* === SELECTION OBLIGATION === */}
      <div className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
        <h3 className="text-base font-medium mb-4">
          1. Sélection de l&apos;obligation
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-slate-600 mb-1">
              Émetteur (État)
            </label>
            <select
              value={selectedCountry}
              onChange={(e) => setSelectedCountry(e.target.value as BondCountry)}
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:border-blue-500 bg-white"
            >
              {availableCountries.map((c) => {
                const count = bonds.filter((b) => b.country === c).length;
                return (
                  <option key={c} value={c}>
                    {countryNames[c]} ({count})
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <label className="block text-sm text-slate-600 mb-1">
              Code ISIN / Obligation
            </label>
            <BondSearchSelect
              bonds={availableBonds}
              value={selectedIsin}
              onChange={setSelectedIsin}
              placeholder="Tapez ISIN, nom, année ou taux..."
            />
          </div>
        </div>

        {selectedBond && (
          <div className="mt-4 p-4 bg-slate-50 rounded-md">
            <div className="text-xs text-slate-500 font-medium mb-3">
              CARACTÉRISTIQUES DE L&apos;OBLIGATION
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div>
                <div className="text-xs text-slate-500">Nominal</div>
                <div className="font-medium">
                  {formatFCFA(selectedBond.nominalValue)} FCFA
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Coupon</div>
                <div className="font-medium">
                  {(selectedBond.couponRate * 100).toFixed(2)}%
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Fréquence</div>
                <div className="font-medium">
                  {selectedBond.frequency === 1
                    ? "Annuelle"
                    : selectedBond.frequency === 2
                    ? "Semestrielle"
                    : "Trimestrielle"}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Type</div>
                <div className="font-medium">{selectedBond.type}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Date émission</div>
                <div className="font-medium text-xs">
                  {formatDateFR(parseDate(selectedBond.issueDate))}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Date échéance</div>
                <div className="font-medium text-xs">
                  {formatDateFR(parseDate(selectedBond.maturityDate))}
                </div>
              </div>
              {data && (
                <>
                  <div>
                    <div className="text-xs text-slate-500">Dernier coupon</div>
                    <div className="font-medium text-xs">
                      {formatDateFR(data.previousCouponDate)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Prochain coupon</div>
                    <div className="font-medium text-xs">
                      {data.nextCouponDate
                        ? formatDateFR(data.nextCouponDate)
                        : "—"}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* === PARAMETRES OPERATION === */}
      <div className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
        <h3 className="text-base font-medium mb-4">
          2. Paramètres de l&apos;opération
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm text-slate-600 mb-1">
              Date d&apos;opération
            </label>
            <input
              type="date"
              value={operationDateStr}
              onChange={(e) => setOperationDateStr(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-600 mb-1">
              Nombre de titres
            </label>
            <input
              type="number"
              min="1"
              value={numberOfBonds}
              onChange={(e) => setNumberOfBonds(Number(e.target.value))}
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:border-blue-500"
            />
            {selectedBond && (
              <p className="text-xs text-slate-400 mt-1">
                Montant nominal :{" "}
                {formatFCFA(numberOfBonds * selectedBond.nominalValue)} FCFA
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm text-slate-600 mb-1">
              Prix propre unitaire (FCFA)
            </label>
            <input
              type="number"
              step="0.01"
              value={userCleanPrice}
              onChange={(e) => setUserCleanPrice(Number(e.target.value))}
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:border-blue-500"
            />
            {selectedBond && userCleanPrice > 0 && (
              <p className="text-xs text-slate-400 mt-1">
                {userCleanPrice < selectedBond.nominalValue
                  ? "Décote"
                  : userCleanPrice > selectedBond.nominalValue
                  ? "Surcote"
                  : "Au pair"}
              </p>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
          ⚠️ {error}
        </div>
      )}

      {/* === RESULTATS === */}
      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            <div className="bg-white rounded-lg border-2 border-blue-200 p-4">
              <div className="text-xs text-blue-700 font-medium mb-1">
                YTM implicite
              </div>
              <div className="text-2xl md:text-3xl font-semibold text-blue-900">
                {(data.ytm * 100).toFixed(2)}%
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Rendement actuariel
              </div>
            </div>

            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <div className="text-xs text-slate-500 mb-1">Duration modifiée</div>
              <div className="text-2xl md:text-3xl font-semibold">
                {data.modifiedDuration.toFixed(2)}
              </div>
              <div className="text-xs text-slate-500 mt-1">années</div>
            </div>

            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <div className="text-xs text-slate-500 mb-1">Intérêts courus</div>
              <div className="text-2xl md:text-3xl font-semibold">
                {formatFCFA2(data.accruedInterest)}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {data.daysSinceLastCoupon} jours · Act/365
              </div>
            </div>

            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <div className="text-xs text-slate-500 mb-1">Convexité</div>
              <div className="text-2xl md:text-3xl font-semibold">
                {data.convexity.toFixed(2)}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Courbure prix-taux
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
            <div className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
              <h3 className="text-base font-medium mb-4">
                Montants de la transaction
              </h3>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-600">Nombre de titres</dt>
                  <dd className="font-medium">
                    {data.numberOfBonds.toLocaleString("fr-FR")}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-600">Montant nominal</dt>
                  <dd className="font-medium">
                    {formatFCFA(data.nominalAmount)} FCFA
                  </dd>
                </div>
                <div className="flex justify-between pt-3 border-t border-slate-100">
                  <dt className="text-slate-600">Prix propre unitaire</dt>
                  <dd className="font-medium">
                    {formatFCFA2(data.userCleanPrice)} FCFA
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-600">Intérêts courus par titre</dt>
                  <dd className="font-medium">
                    {formatFCFA2(data.accruedInterest)} FCFA
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-600">Prix sale unitaire</dt>
                  <dd className="font-medium">
                    {formatFCFA2(data.userDirtyPrice)} FCFA
                  </dd>
                </div>
                <div className="flex justify-between pt-3 border-t border-slate-100">
                  <dt className="text-slate-600">Montant brut</dt>
                  <dd className="font-medium">
                    {formatFCFA(data.grossAmount)} FCFA
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-600">Total intérêts courus</dt>
                  <dd className="font-medium">
                    {formatFCFA(data.totalAccruedInterest)} FCFA
                  </dd>
                </div>
                <div className="flex justify-between pt-3 border-t-2 border-slate-200 text-base">
                  <dt className="font-medium">Montant net à régler</dt>
                  <dd className="font-semibold text-blue-900">
                    {formatFCFA(data.netAmount)} FCFA
                  </dd>
                </div>
              </dl>
            </div>

            <div className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
              <h3 className="text-base font-medium mb-1">
                Prix théorique de référence
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                Basé sur le rendement moyen pondéré des 3 derniers mois du même État
              </p>

              {data.issuancesUsed > 0 ? (
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-slate-600">Rendement moyen 3 mois</dt>
                    <dd className="font-medium">
                      {(data.theoreticalYield * 100).toFixed(2)}%
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-600">Émissions utilisées</dt>
                    <dd className="font-medium">{data.issuancesUsed}</dd>
                  </div>
                  <div className="flex justify-between pt-3 border-t border-slate-100">
                    <dt className="text-slate-600">Prix propre théorique</dt>
                    <dd className="font-medium">
                      {formatFCFA2(data.theoreticalCleanPrice)} FCFA
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-600">Prix sale théorique</dt>
                    <dd className="font-medium">
                      {formatFCFA2(data.theoreticalDirtyPrice)} FCFA
                    </dd>
                  </div>
                  <div className="flex justify-between pt-3 border-t-2 border-slate-200">
                    <dt className="font-medium">
                      Écart (votre prix − théorique)
                    </dt>
                    <dd
                      className={`font-semibold ${
                        data.priceDelta >= 0 ? "text-red-700" : "text-green-700"
                      }`}
                    >
                      {data.priceDelta >= 0 ? "+" : ""}
                      {formatFCFA2(data.priceDelta)} FCFA
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-600">Écart en %</dt>
                    <dd
                      className={`font-medium ${
                        data.priceDelta >= 0 ? "text-red-700" : "text-green-700"
                      }`}
                    >
                      {data.priceDelta >= 0 ? "+" : ""}
                      {data.priceDeltaPercent.toFixed(2)}%
                    </dd>
                  </div>
                  <div className="mt-4 p-3 bg-slate-50 rounded-md text-xs text-slate-700 leading-relaxed">
                    {data.priceDelta > 0
                      ? "Votre prix est supérieur au prix théorique : vous payez une prime par rapport au marché récent."
                      : data.priceDelta < 0
                      ? "Votre prix est inférieur au prix théorique : vous achetez à un niveau plus attractif que la moyenne récente."
                      : "Votre prix est aligné sur le prix théorique du marché."}
                  </div>
                </dl>
              ) : (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-900">
                  Aucune émission sur les 3 derniers mois pour{" "}
                  {countryNames[data.bond.country]}. Le prix théorique ne peut
                  pas être calculé.
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}