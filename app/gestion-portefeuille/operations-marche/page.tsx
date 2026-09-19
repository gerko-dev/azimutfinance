import OperationsMarchePanel from "@/components/gestion-portefeuille/OperationsMarchePanel";

import { loadMyFunds } from "../data";
import { loadToutesOperationsMarche } from "../operations-marche-data";
import { construirePointTresorerie } from "../tresorerie-data";
import { etatsMtp, titresMtp } from "../operations-marche-titres";
import { listerPartenairesAction } from "../partenaires-actions";
import { chargerParametresMarche } from "../parametres-marche-data";

export const metadata = {
  title: "Opérations de marché — Gestion de portefeuille",
};

export const dynamic = "force-dynamic";

/**
 * Écran INTERFONDS de saisie des opérations de marché.
 *
 * Hors de la fiche d'un fonds, délibérément : une séance se saisit par
 * bordereau, et une même adjudication se répartit entre plusieurs
 * portefeuilles. Le fonds est donc une colonne de la saisie, pas le contexte
 * de la page.
 *
 * La garde `requireAdmin(1)` du layout couvre cette route ; les actions
 * serveur ont la leur.
 */
export default async function OperationsMarchePage() {
  const [fonds, operations, parametres] = await Promise.all([
    loadMyFunds(),
    loadToutesOperationsMarche(),
    chargerParametresMarche(),
  ]);

  // Comptes du PREMIER fonds seulement : c'est celui que le formulaire
  // présente d'emblée. Les résoudre ici évite au client un aller-retour au
  // montage — et surtout un setState dans un effet, que le lint du projet
  // interdit. Les autres fonds se chargent au changement, sur l'événement.
  const premier = fonds[0];
  const point = premier ? await construirePointTresorerie(premier.id, "") : null;
  const comptesInitiaux = (point?.etablissements ?? []).map((e) => ({
    cle: e.cle,
    nom: e.nom,
    pays: e.pays,
    sens: e.sens,
    groupe: e.groupe,
  }));

  // Les SGI servent aux operations MFR. Les BTCC, eux, ne sont pas des
  // partenaires saisis : ce sont les banques du fonds, deja decrites par ses
  // comptes de tresorerie, et qui arrivent donc avec `comptesInitiaux`.
  const partenaires = await listerPartenairesAction();
  const sgi = partenaires.ok
    ? partenaires.data.filter((x) => x.kind === "sgi" && x.actif)
    : [];

  // Le formulaire s'ouvre sur « Achats MTP réalisés » : ses États et les
  // titres du premier d'entre eux sont résolus ici, pour la même raison que
  // les comptes — pas de chargement au montage, donc pas de setState dans un
  // effet.
  const etatsInitiaux = etatsMtp();
  const titresInitiaux = etatsInitiaux[0] ? titresMtp(etatsInitiaux[0].code) : [];

  return (
    <OperationsMarchePanel
      fonds={fonds.map((f) => ({ id: f.id, nom: f.nom }))}
      operations={operations}
      comptesInitiaux={comptesInitiaux}
      etatsInitiaux={etatsInitiaux}
      titresInitiaux={titresInitiaux}
      sgi={sgi}
      parametres={parametres}
    />
  );
}
