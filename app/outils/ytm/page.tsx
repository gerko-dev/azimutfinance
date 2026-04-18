"use client";

import { useState, useMemo, useEffect } from "react";
import Header from "@/components/Header";
import Ticker from "@/components/Ticker";
import {
  bondsDatabase,
  countryNames,
  getAvailableCountries,
  getBondsByCountry,
  getBondByIsin,
  issuancesHistory,
  type BondCountry,
} from "@/lib/bondsUEMOA";
import {
  calculateFullBondPricing,
  parseDate,
  formatDateISO,
} from "@/lib/bondMath";

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

export default function YTMCalculatorPage() {
  // === ETATS ===
  const availableCountries = useMemo(() => getAvailableCountries(), []);
  const [selectedCountry, setSelectedCountry] = useState<BondCountry>(availableCountries[0]);
  const [selectedIsin, setSelectedIsin] = useState<string>("");
  const [operationDateStr, setOperationDateStr] = useState<string>(
    formatDateISO(new Date())
  );
  const [numberOfBonds, setNumberOfBonds] = useState<number>(100);
  const [userCleanPrice, setUserCleanPrice] = useState<number>(10000);

  // === DERIVE : obligations disponibles pour le pays ===
  const availableBonds = useMemo(() => {
    return getBondsByCountry(selectedCountry);
  }, [selectedCountry]);

  // === Effet : reset ISIN quand pays change ===
  useEffect(() => {
    if (availableBonds.length > 0) {
      setSelectedIsin(availableBonds[0].isin);
    } else {
      setSelectedIsin("");
    }
  }, [selectedCountry, availableBonds]);

  // === Obligation selectionnee ===
  const selectedBond = useMemo(() => {
    return selectedIsin ? getBondByIsin(selectedIsin) : undefined;
  }, [selectedIsin]);

  // === Effet : mettre a jour prix par defaut quand obligation change ===
  useEffect(() => {
    if (selectedBond) {
      setUserCleanPrice(selectedBond.nominalValue);
    }
  }, [selectedBond]);

  // === CALCUL PRINCIPAL ===
  const result = useMemo(() => {
    if (!selectedBond || userCleanPrice <= 0 || numberOfBonds <= 0) {
      return null;
    }

    const operationDate = parseDate(operationDateStr);
    const maturityDate = parseDate(selectedBond.maturityDate);
    const issueDate = parseDate(selectedBond.issueDate);

    // Validations dates
    if (operationDate.getTime() < issueDate.getTime()) {
      return { error: "La date d'operation doit etre apres l'emission" };
    }
    if (operationDate.getTime() >= maturityDate.getTime()) {
      return { error: "La date d'operation doit etre avant l'echeance" };
    }

    try {
      const r = calculateFullBondPricing(
        selectedBond,
        operationDate,
        numberOfBonds,
        userCleanPrice,
        issuancesHistory
      );
      return { data: r };
    } catch (e) {
      return { error: "Erreur de calcul" };
    }
  }, [selectedBond, operationDateStr, numberOfBonds, userCleanPrice]);

  const data = result && "data" in result ? result.data : null;
  const error = result && "error" in result ? result.error : null;

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <Ticker />

      {/* En-tete */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
          <div className="text-xs md:text-sm text-slate-500 mb-2">
            Accueil › Outils Pro › Calculateur YTM
          </div>
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <h1 className="text-2xl md:text-3xl font-semibold">
              Calculateur YTM & Pricing obligataire
            </h1>
            <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded font-medium">
              PREMIUM
            </span>
          </div>
          <p className="text-sm md:text-base text-slate-600">
            Pricing, YTM, duration et interets courus pour obligations souveraines UEMOA · Convention Act/365
          </p>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-6 space-y-4 md:space-y-6">

        {/* === FORMULAIRE PRINCIPAL === */}
        <div className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
          <h3 className="text-base font-medium mb-4">1. Selection de l&apos;obligation</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Selection pays */}
            <div>
              <label className="block text-sm text-slate-600 mb-1">
                Emetteur (Etat)
              </label>
              <select
                value={selectedCountry}
                onChange={(e) => setSelectedCountry(e.target.value as BondCountry)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:border-blue-500 bg-white"
              >
                {availableCountries.map((c) => (
                  <option key={c} value={c}>
                    {countryNames[c]}
                  </option>
                ))}
              </select>
            </div>

            {/* Selection ISIN */}
            <div>
              <label className="block text-sm text-slate-600 mb-1">
                Code ISIN / Obligation
              </label>
              <select
                value={selectedIsin}
                onChange={(e) => setSelectedIsin(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:border-blue-500 bg-white"
                disabled={availableBonds.length === 0}
              >
                {availableBonds.map((b) => (
                  <option key={b.isin} value={b.isin}>
                    {b.nameShort} — {b.isin}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Caracteristiques de l'obligation */}
          {selectedBond && (
            <div className="mt-4 p-4 bg-slate-50 rounded-md">
              <div className="text-xs text-slate-500 font-medium mb-3">
                CARACTERISTIQUES DE L&apos;OBLIGATION
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <div className="text-xs text-slate-500">Nominal</div>
                  <div className="font-medium">{formatFCFA(selectedBond.nominalValue)} FCFA</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Coupon</div>
                  <div className="font-medium">{(selectedBond.couponRate * 100).toFixed(2)}%</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Frequence</div>
                  <div className="font-medium">
                    {selectedBond.frequency === 1 ? "Annuelle" : selectedBond.frequency === 2 ? "Semestrielle" : "Trimestrielle"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Type</div>
                  <div className="font-medium">{selectedBond.type}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Date emission</div>
                  <div className="font-medium text-xs">{formatDateFR(parseDate(selectedBond.issueDate))}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Date echeance</div>
                  <div className="font-medium text-xs">{formatDateFR(parseDate(selectedBond.maturityDate))}</div>
                </div>
                {data && (
                  <>
                    <div>
                      <div className="text-xs text-slate-500">Dernier coupon</div>
                      <div className="font-medium text-xs">{formatDateFR(data.previousCouponDate)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Prochain coupon</div>
                      <div className="font-medium text-xs">
                        {data.nextCouponDate ? formatDateFR(data.nextCouponDate) : "—"}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* === SAISIES UTILISATEUR === */}
        <div className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
          <h3 className="text-base font-medium mb-4">2. Parametres de l&apos;operation</h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-slate-600 mb-1">
                Date d&apos;operation
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
                  Montant nominal : {formatFCFA(numberOfBonds * selectedBond.nominalValue)} FCFA
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
                  {userCleanPrice < selectedBond.nominalValue ? "Decote" : userCleanPrice > selectedBond.nominalValue ? "Surcote" : "Au pair"}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* === ERREUR === */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
            ⚠️ {error}
          </div>
        )}

        {/* === RESULTATS === */}
        {data && (
          <>
            {/* Metriques cles */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
              <div className="bg-white rounded-lg border-2 border-blue-200 p-4">
                <div className="text-xs text-blue-700 font-medium mb-1">YTM implicite</div>
                <div className="text-2xl md:text-3xl font-semibold text-blue-900">
                  {(data.ytm * 100).toFixed(2)}%
                </div>
                <div className="text-xs text-slate-500 mt-1">Rendement actuariel</div>
              </div>

              <div className="bg-white rounded-lg border border-slate-200 p-4">
                <div className="text-xs text-slate-500 mb-1">Duration modifiee</div>
                <div className="text-2xl md:text-3xl font-semibold">
                  {data.modifiedDuration.toFixed(2)}
                </div>
                <div className="text-xs text-slate-500 mt-1">années</div>
              </div>

              <div className="bg-white rounded-lg border border-slate-200 p-4">
                <div className="text-xs text-slate-500 mb-1">Interets courus</div>
                <div className="text-2xl md:text-3xl font-semibold">
                  {formatFCFA2(data.accruedInterest)}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {data.daysSinceLastCoupon} jours · Act/365
                </div>
              </div>

              <div className="bg-white rounded-lg border border-slate-200 p-4">
                <div className="text-xs text-slate-500 mb-1">Convexite</div>
                <div className="text-2xl md:text-3xl font-semibold">
                  {data.convexity.toFixed(2)}
                </div>
                <div className="text-xs text-slate-500 mt-1">Courbure prix-taux</div>
              </div>
            </div>

            {/* Montants transaction + Comparaison prix theorique */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">

              {/* Montants transaction */}
              <div className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
                <h3 className="text-base font-medium mb-4">Montants de la transaction</h3>
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-slate-600">Nombre de titres</dt>
                    <dd className="font-medium">{data.numberOfBonds.toLocaleString("fr-FR")}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-600">Montant nominal</dt>
                    <dd className="font-medium">{formatFCFA(data.nominalAmount)} FCFA</dd>
                  </div>
                  <div className="flex justify-between pt-3 border-t border-slate-100">
                    <dt className="text-slate-600">Prix propre unitaire</dt>
                    <dd className="font-medium">{formatFCFA2(data.userCleanPrice)} FCFA</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-600">Interets courus par titre</dt>
                    <dd className="font-medium">{formatFCFA2(data.accruedInterest)} FCFA</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-600">Prix sale unitaire</dt>
                    <dd className="font-medium">{formatFCFA2(data.userDirtyPrice)} FCFA</dd>
                  </div>
                  <div className="flex justify-between pt-3 border-t border-slate-100">
                    <dt className="text-slate-600">Montant brut (propre × Nb)</dt>
                    <dd className="font-medium">{formatFCFA(data.grossAmount)} FCFA</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-600">Total intérêts courus</dt>
                    <dd className="font-medium">{formatFCFA(data.totalAccruedInterest)} FCFA</dd>
                  </div>
                  <div className="flex justify-between pt-3 border-t-2 border-slate-200 text-base">
                    <dt className="font-medium">Montant net à régler</dt>
                    <dd className="font-semibold text-blue-900">{formatFCFA(data.netAmount)} FCFA</dd>
                  </div>
                </dl>
              </div>

              {/* Prix theorique */}
              <div className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
                <h3 className="text-base font-medium mb-1">Prix theorique de reference</h3>
                <p className="text-xs text-slate-500 mb-4">
                  Base sur le rendement moyen pondere des 3 derniers mois du meme Etat
                </p>

                {data.issuancesUsed > 0 ? (
                  <dl className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-slate-600">Rendement moyen 3 mois</dt>
                      <dd className="font-medium">{(data.theoreticalYield * 100).toFixed(2)}%</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-600">Emissions utilisees</dt>
                      <dd className="font-medium">{data.issuancesUsed}</dd>
                    </div>
                    <div className="flex justify-between pt-3 border-t border-slate-100">
                      <dt className="text-slate-600">Prix propre theorique</dt>
                      <dd className="font-medium">{formatFCFA2(data.theoreticalCleanPrice)} FCFA</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-600">Prix sale theorique</dt>
                      <dd className="font-medium">{formatFCFA2(data.theoreticalDirtyPrice)} FCFA</dd>
                    </div>
                    <div className="flex justify-between pt-3 border-t-2 border-slate-200">
                      <dt className="font-medium">Ecart (votre prix − theorique)</dt>
                      <dd className={`font-semibold ${data.priceDelta >= 0 ? "text-red-700" : "text-green-700"}`}>
                        {data.priceDelta >= 0 ? "+" : ""}{formatFCFA2(data.priceDelta)} FCFA
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-600">Ecart en %</dt>
                      <dd className={`font-medium ${data.priceDelta >= 0 ? "text-red-700" : "text-green-700"}`}>
                        {data.priceDelta >= 0 ? "+" : ""}{data.priceDeltaPercent.toFixed(2)}%
                      </dd>
                    </div>
                    <div className="mt-4 p-3 bg-slate-50 rounded-md text-xs text-slate-700 leading-relaxed">
                      {data.priceDelta > 0
                        ? "Votre prix est superieur au prix theorique : vous payez une prime par rapport au marche recent."
                        : data.priceDelta < 0
                        ? "Votre prix est inferieur au prix theorique : vous achetez a un niveau plus attractif que la moyenne recente."
                        : "Votre prix est aligne sur le prix theorique du marche."}
                    </div>
                  </dl>
                ) : (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-900">
                    Aucune emission sur les 3 derniers mois pour {countryNames[data.bond.country]}. Le prix theorique ne peut pas etre calcule.
                  </div>
                )}
              </div>
            </div>

            {/* Bloc explicatif methodologique */}
            <div className="bg-blue-50 rounded-lg border border-blue-200 p-4 md:p-6">
              <h3 className="text-base font-medium text-blue-900 mb-3">Methodologie</h3>
              <div className="text-sm text-blue-900 space-y-2 leading-relaxed">
                <p>
                  <strong>Convention Act/365</strong> : tous les calculs utilisent le nombre de jours calendaires reels divises par 365.
                </p>
                <p>
                  <strong>YTM implicite</strong> : taux qui egalise la somme des flux futurs actualises au prix sale (prix propre + CC). Resolu par bissection numerique (precision 1 centime).
                </p>
                <p>
                  <strong>Interets courus</strong> : CC = (Coupon annuel × jours depuis dernier coupon) / 365.
                </p>
                <p>
                  <strong>Prix theorique</strong> : actualisation des flux restants au rendement moyen pondere par les montants emis sur les 3 derniers mois du meme Etat.
                </p>
              </div>
            </div>
          </>
        )}

      </main>
    </div>
  );
}