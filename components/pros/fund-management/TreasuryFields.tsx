"use client";

import {
  BANKS_BY_COUNTRY,
  MOBILE_MONEY_PROVIDERS,
} from "@/app/pros/fund-management/portfolio-security-schema";

const PAYS = [...Object.keys(BANKS_BY_COUNTRY), "Autre"];
const MM_LIST_ID = "mm-providers";

// Champs d'un compte de trésorerie : cascade Pays → Banque (liste BCEAO des
// établissements agréés du pays), type de compte et rémunération éventuelle.
// Partagé entre le formulaire d'import et l'éditeur du référentiel.
export default function TreasuryFields({
  attrs,
  setAttr,
  inputCls,
}: {
  attrs: Record<string, string>;
  setAttr: (key: string, value: string) => void;
  inputCls: string;
}) {
  const pays = attrs.pays ?? "";
  const banks = BANKS_BY_COUNTRY[pays] ?? [];
  const canal = attrs.canal === "mobile_money" ? "mobile_money" : "banque";
  // La rémunération est portée par le type de compte : le taux n'est saisi que
  // pour un « compte courant rémunéré ».
  const remunere = attrs.typeCompte === "courant_remunere";

  return (
    <>
      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-wider text-slate-500">
          Type d&apos;établissement
        </span>
        <select
          value={canal}
          onChange={(e) => {
            const v = e.target.value;
            setAttr("canal", v);
            setAttr("banque", ""); // réinitialise l'établissement au changement de canal
            if (v === "mobile_money") {
              setAttr("natureCompte", "espece"); // toujours espèce
              // Pas de compte courant pour le mobile money : bascule sur un
              // type valide si un compte courant était sélectionné.
              if (attrs.typeCompte === "courant" || attrs.typeCompte === "courant_remunere") {
                setAttr("typeCompte", "encaissement");
              }
            }
          }}
          className={inputCls}
        >
          <option value="banque">Banque</option>
          <option value="mobile_money">Mobile Money</option>
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-wider text-slate-500">Pays</span>
        <select
          value={pays}
          onChange={(e) => {
            setAttr("pays", e.target.value);
            if (canal === "banque") setAttr("banque", ""); // banque dépend du pays
          }}
          className={inputCls}
        >
          <option value="">— Choisir —</option>
          {PAYS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>

      {canal === "banque" && pays === "Autre" ? (
        /* Pays hors UEMOA / non listé : saisie libre du nom de la banque. */
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-slate-500">Banque</span>
          <input
            type="text"
            value={attrs.banque ?? ""}
            onChange={(e) => setAttr("banque", e.target.value)}
            placeholder="Nom de la banque"
            className={inputCls}
          />
        </label>
      ) : canal === "banque" ? (
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-slate-500">Banque</span>
          <select
            value={attrs.banque ?? ""}
            disabled={!pays}
            onChange={(e) => setAttr("banque", e.target.value)}
            className={`${inputCls} disabled:opacity-50`}
          >
            <option value="">{pays ? "— Choisir —" : "Choisir d'abord le pays"}</option>
            {banks.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
            {/* Conserve une valeur héritée hors liste (données anciennes). */}
            {attrs.banque && !banks.includes(attrs.banque) && (
              <option value={attrs.banque}>{attrs.banque}</option>
            )}
          </select>
        </label>
      ) : (
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-slate-500">
            Nom du Mobile Money
          </span>
          <input
            type="text"
            list={MM_LIST_ID}
            value={attrs.banque ?? ""}
            onChange={(e) => setAttr("banque", e.target.value)}
            placeholder="Ex. Wave, Orange Money…"
            className={inputCls}
          />
          <datalist id={MM_LIST_ID}>
            {MOBILE_MONEY_PROVIDERS.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </label>
      )}

      {canal === "banque" && (
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-slate-500">
            Nature du compte
          </span>
          <select
            value={attrs.natureCompte ?? "espece"}
            onChange={(e) => setAttr("natureCompte", e.target.value)}
            className={inputCls}
          >
            <option value="espece">Compte espèce</option>
            <option value="depositaire">Compte dépositaire</option>
          </select>
        </label>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-wider text-slate-500">Type de compte</span>
        <select
          value={attrs.typeCompte ?? (canal === "banque" ? "courant" : "encaissement")}
          onChange={(e) => setAttr("typeCompte", e.target.value)}
          className={inputCls}
        >
          {canal === "banque" && (
            <>
              <option value="courant">Compte courant</option>
              <option value="courant_remunere">Compte courant rémunéré</option>
            </>
          )}
          <option value="encaissement">Encaissement</option>
          <option value="decaissement">Décaissement</option>
          <option value="autre">Autre</option>
        </select>
      </label>

      {remunere && (
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-slate-500">
            Taux de rémunération
          </span>
          <div className="relative">
            <input
              type="text"
              inputMode="decimal"
              value={attrs.tauxRemuneration ?? ""}
              onChange={(e) => setAttr("tauxRemuneration", e.target.value)}
              placeholder="3,5"
              className={`${inputCls} w-full pr-7`}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm pointer-events-none">
              %
            </span>
          </div>
        </label>
      )}
    </>
  );
}
