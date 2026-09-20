"use client";

// === Volets réméré et prêt de titres, sur un ordre MTP ===
//
// MTP UNIQUEMENT. Un réméré se noue de gré à gré sur un titre public, et un
// prêt de titres porte sur le même gisement : les proposer sur un ordre de
// bourse n'aurait pas de sens.
//
// Les deux s'EXCLUENT : un même ordre ne peut pas être à la fois une cession
// temporaire et un prêt.
//
// CE QUI SE DÉDUIT NE SE SAISIT PAS. Le sens du réméré découle du sens de
// l'ordre ; son statut et sa date de dénouement découlent de l'opération de
// dénouement et de son exécution. Aucun de ces trois champs n'est ici : un
// statut qu'on coche à la main est un statut qui finit par mentir.
//
// Ce composant rend ses champs comme des enfants directs de la grille du
// formulaire : ils s'y rangent donc exactement comme les autres, sans grille
// imbriquée qui casserait l'alignement.

import {
  LIBELLES_SENS_REMERE,
  interetPret,
  montantRemere,
  type SaisiePret,
  type SaisieRemere,
  type SensRemere,
} from "@/app/gestion-portefeuille/operations-marche-types";
import type { Partenaire } from "@/app/gestion-portefeuille/partenaires-types";
import { BANKS_BY_COUNTRY } from "@/app/gestion-portefeuille/portfolio-security-schema";
import ChampTaux from "./ChampTaux";

const fmt0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const montantFr = (v: number) => fmt0.format(Math.round(v));

/** Jours calendaires entre deux dates ISO. Sert au repère affiché sous
 *  l'intérêt ; le calcul qui fait foi vit dans `interetPret`. */
const joursEntre = (debut: string, fin: string): number => {
  const a = new Date(`${debut}T00:00:00Z`).getTime();
  const b = new Date(`${fin}T00:00:00Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
};

const champ =
  "w-full text-xs border border-slate-300 rounded px-2 py-1.5 focus:border-blue-400 focus:outline-none";
const etiquette = "text-[10px] uppercase tracking-wider text-slate-500";
const aide = "text-[9px] text-slate-400";

function Champ({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className={etiquette}>{label}</span>
      {children}
    </label>
  );
}

export type EtatVolets = {
  estRemere: boolean;
  estPret: boolean;
  remere: SaisieRemere;
  pret: SaisiePret;
};

export default function VoletsMtp({
  etat,
  onChange,
  quantite,
  prixOrdre,
  interetsCourus,
  dateOperation,
  sens,
  pretPossible,
  contreparties,
  verrouille = false,
}: {
  etat: EtatVolets;
  onChange: (e: EtatVolets) => void;
  quantite: number;
  prixOrdre: number;
  interetsCourus: number;
  /** Date de l'ordre : point de départ de la durée du prêt. */
  dateOperation: string;
  /** DÉDUIT du sens de l'ordre. Affiché, jamais choisi. */
  sens: SensRemere;
  /** Vrai sur une VENTE MTP seulement. Prêter, c'est faire sortir des titres :
   *  la case n'a aucun sens sur un ordre d'achat. */
  pretPossible: boolean;
  contreparties: Partenaire[];
  /** Vrai sur une opération de dénouement : elle solde un réméré, elle n'en
   *  ouvre pas un. */
  verrouille?: boolean;
}) {
  const { estRemere, estPret, remere, pret } = etat;
  const setRemere = (r: Partial<SaisieRemere>) =>
    onChange({ ...etat, remere: { ...remere, ...r } });
  const setPret = (p: Partial<SaisiePret>) => onChange({ ...etat, pret: { ...pret, ...p } });

  // Base 360, comme le contrat : valeur des titres × taux × jours / 360. La
  // durée s'arrête à la reprise quand elle a eu lieu — des titres rendus plus
  // tôt ne se paient pas jusqu'au terme.
  const interet = interetPret({ dateOperation, quantite, prix: prixOrdre }, pret);
  const finPret = pret.dateReprise ?? pret.dateFin;
  const jours = finPret ? joursEntre(dateOperation, finPret) : 0;

  if (verrouille) {
    return (
      <div className="sm:col-span-2 lg:col-span-4 text-[10px] text-slate-500 pt-2 border-t border-slate-100">
        Cette opération <strong>dénoue un réméré</strong> : elle ne peut pas en ouvrir
        un autre, ni porter un prêt de titres.
      </div>
    );
  }

  return (
    <>
      <div className="sm:col-span-2 lg:col-span-4 flex flex-wrap items-center gap-5 pt-2 border-t border-slate-100">
        <label className="flex items-center gap-2 text-xs text-slate-700">
          <input
            type="checkbox"
            checked={estRemere}
            onChange={(e) =>
              onChange({ ...etat, estRemere: e.target.checked, estPret: false })
            }
          />
          Réméré
        </label>
        {/* PRÊTER, C'EST FAIRE SORTIR DES TITRES : la case ne vaut que sur une
            vente MTP. La proposer sur un achat aurait laissé prêter ce qu'on
            est en train d'acquérir. */}
        {pretPossible && (
          <label className="flex items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={estPret}
              onChange={(e) =>
                onChange({ ...etat, estPret: e.target.checked, estRemere: false })
              }
            />
            Prêt de titres
          </label>
        )}
        {/* Dire ce que la case CHANGE au point de trésorerie. Sans cela, un
            ordre coché réméré cesserait d'alimenter les achats MTP sans que
            rien ne l'annonce. */}
        {(estRemere || estPret) && (
          <span className="text-[10px] text-amber-700">
            {estRemere
              ? "Pèse dans « à réméré validés » tant que l'ordre n'est pas servi, puis dans les réalisés."
              : "N'alimente aucun poste : un prêt de titres ne déplace pas de cash."}
          </span>
        )}
      </div>

      {estRemere && (
        <>
          <Champ label="Contrepartie">
            {/* Du RÉFÉRENTIEL, sous la nature « Contrepartie réméré ». La
                retaper à chaque ligne l'aurait fait diverger d'un réméré à
                l'autre, et rendu tout regroupement faux. */}
            <select
              value={remere.contrepartie}
              onChange={(e) => setRemere({ contrepartie: e.target.value })}
              className={champ}
            >
              <option value="">— Choisir —</option>
              {contreparties.map((c) => (
                <option key={c.id} value={c.nom}>
                  {c.nom}
                </option>
              ))}
              {/* Une fiche désactivée ou supprimée ne doit pas effacer en
                  silence la contrepartie d'un réméré déjà saisi. */}
              {remere.contrepartie &&
                !contreparties.some((c) => c.nom === remere.contrepartie) && (
                  <option value={remere.contrepartie}>
                    {remere.contrepartie} (hors liste)
                  </option>
                )}
            </select>
            {contreparties.length === 0 && (
              <span className={aide}>
                Aucune contrepartie au référentiel — Paramètres &gt; Partenaires.
              </span>
            )}
          </Champ>

          <Champ label="Sens">
            {/* DÉDUIT du sens de l'ordre, et donc affiché en clair plutôt que
                proposé : vendre à réméré fait encaisser, acheter fait
                décaisser. Le demander, c'était permettre de se contredire — et
                d'envoyer le montant dans le mauvais poste. */}
            <div className="text-xs border border-slate-200 bg-slate-50 rounded px-2 py-1.5 text-slate-600">
              {LIBELLES_SENS_REMERE[sens]}
            </div>
            <span className={aide}>
              {sens === "cash_in"
                ? "Le fonds encaisse maintenant, et rachètera"
                : "Le fonds décaisse maintenant, et revendra"}
            </span>
          </Champ>

          <Champ label="Fin du réméré">
            <input
              type="date"
              value={remere.dateFin}
              onChange={(e) => setRemere({ dateFin: e.target.value })}
              className={champ}
            />
            <span className={aide}>C&apos;est là que le remboursement tombe</span>
          </Champ>

          <Champ label="Prix de sortie">
            <input
              value={String(remere.prixSortie)}
              onChange={(e) =>
                setRemere({
                  prixSortie:
                    Number(e.target.value.replace(/\s/g, "").replace(",", ".")) || 0,
                })
              }
              inputMode="numeric"
              className={`${champ} text-right tabular-nums`}
            />
            <span className={aide}>
              entrée à {fmt0.format(prixOrdre)} · montant{" "}
              {montantFr(montantRemere({ quantite, interetsCourus }, remere))} F
            </span>
          </Champ>

          <div className="sm:col-span-2 lg:col-span-4 text-[10px] text-slate-500">
            Le dénouement se saisit plus tard, depuis le bouton{" "}
            <strong>Dénouer</strong> de l&apos;onglet Rémérés : il ouvre l&apos;opération
            MTP de sens inverse, et le réméré est soldé dès qu&apos;elle est exécutée.
            {sens === "cash_out" && (
              <>
                {" "}
                Les titres <strong>pris en réméré</strong> entrent à l&apos;inventaire
                mais doivent retourner à la contrepartie : ils ne sont{" "}
                <strong>pas cessibles</strong> avant le dénouement.
              </>
            )}
          </div>
        </>
      )}

      {estPret && (
        <>
          {/* L'EMPRUNTEUR EST UNE BANQUE DE L'UMOA, et on la choisit dans le
              référentiel BCEAO déjà embarqué — le même qui sert à la cascade
              Pays → Banque des comptes de trésorerie. Saisie libre, le nom
              aurait divergé d'un prêt à l'autre et tout regroupement serait
              devenu faux. Les pays regroupent la liste : cent trente-six
              établissements à plat ne se parcourent pas. */}
          <Champ label="Contrepartie">
            <select
              value={pret.contrepartie}
              onChange={(e) => setPret({ contrepartie: e.target.value })}
              className={champ}
            >
              <option value="">— Choisir —</option>
              {Object.entries(BANKS_BY_COUNTRY).map(([pays, banques]) => (
                <optgroup key={pays} label={pays}>
                  {banques.map((b) => (
                    <option key={`${pays}-${b}`} value={b}>
                      {b}
                    </option>
                  ))}
                </optgroup>
              ))}
              {/* Un prêt déjà saisi ne doit pas perdre sa contrepartie parce
                  que le référentiel a changé. */}
              {pret.contrepartie &&
                !Object.values(BANKS_BY_COUNTRY).some((l) =>
                  l.includes(pret.contrepartie),
                ) && <option value={pret.contrepartie}>{pret.contrepartie} (hors liste)</option>}
            </select>
          </Champ>

          <Champ label="Fin du prêt">
            <input
              type="date"
              value={pret.dateFin ?? ""}
              onChange={(e) => setPret({ dateFin: e.target.value || null })}
              className={champ}
            />
          </Champ>

          {/* `ChampTaux` garde son propre texte : un champ contrôlé reconverti
              depuis un nombre effacerait la virgule sous les doigts, et un taux
              de prêt se compte en dixièmes de point. */}
          <Champ label="Taux prêt (%)">
            <ChampTaux
              valeur={pret.tauxCommission}
              onChange={(v) => setPret({ tauxCommission: v })}
              className={`${champ} text-right tabular-nums`}
            />
          </Champ>

          {/* CALCULÉ, jamais saisi : valeur des titres × taux × jours / 360.
              Le saisir, c'était accepter qu'il diverge du taux affiché juste
              à côté. */}
          <Champ label="Intérêt à recevoir">
            <div className="text-xs border border-slate-200 bg-slate-50 rounded px-2 py-1.5 text-right tabular-nums text-slate-700">
              {montantFr(interet)} F
            </div>
            <span className={aide}>
              {jours > 0
                ? `${jours} j base 360, sur ${montantFr(quantite * prixOrdre)} F`
                : "Renseigne la fin du prêt"}
            </span>
          </Champ>

          {/* LA REPRISE N'EST PAS UN CHAMP DE CE FORMULAIRE. Une date de
              reprise saisie ici ne serait qu'une promesse ; elle se pose au
              moment où les titres reviennent, d'un bouton sur la ligne. */}
          <div className="sm:col-span-2 lg:col-span-4 text-[10px] text-slate-500">
            Le titre <strong>reste à l&apos;inventaire</strong> : il continue de
            produire ses intérêts courus et le fonds en reste destinataire des
            amortissements. Aucun flux de trésorerie, donc — la seule contrainte est
            qu&apos;un titre prêté <strong>ne peut pas être cédé</strong> tant
            qu&apos;il n&apos;est pas repris. La reprise se fait depuis le bouton{" "}
            <strong>Reprendre</strong> de l&apos;onglet Prêts de titres.
          </div>
        </>
      )}
    </>
  );
}
