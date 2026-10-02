import "server-only";

// === Les apports et retraits de chaque classe d'actif, datés ===
//
// Ce que la performance d'une poche doit neutraliser : l'argent que le gérant
// y a mis, ou qu'il en a sorti. Il vient des ORDRES DE MARCHE — un achat fait
// entrer du capital dans la classe du titre acheté, une vente l'en fait sortir.
//
// ON NE COMPTE QUE CE QUI EST DENOUE. Un ordre passé et non servi n'a déplacé
// aucun capital : il pèse sur la trésorerie à venir, pas sur la performance
// passée. C'est la date de DENOUEMENT qui fait foi, celle où le titre entre au
// portefeuille, et non la date de l'ordre.
//
// CE QUE CE MODULE NE VOIT PAS, et qu'il faut savoir : les coupons et
// dividendes DETACHES pendant la période. Un coupon sort de la poche
// obligataire — la valorisation du titre porte son couru, qui retombe à zéro
// le jour du détachement — et entre en trésorerie. Faute de les compter, la
// performance obligataire est minorée du coupon encaissé, et celle de la
// trésorerie majorée d'autant. Les porter ici demanderait des encaissements
// CONSTATES ; le calendrier ESV, lui, est reconstruit sur les titres détenus
// AUJOURD'HUI, et injecter une estimation dans un calcul de performance
// remplacerait un chiffre faux par un autre, moins visible.

import { loadOperationsMarche } from "./operations-marche-data";
import {
  montantExecution,
  sensDe,
  type Instrument,
} from "./operations-marche-types";
import type { Flux } from "./performance-classe";

/**
 * La classe d'inventaire que vise un instrument d'ordre.
 *
 * LES TITRES PUBLICS SONT DES OBLIGATIONS, du point de vue de l'inventaire :
 * une OAT achetée au marché des titres publics s'y range avec les obligations
 * cotées, et c'est dans cette poche que son achat fait entrer du capital.
 */
function classeDe(instrument: Instrument): string | null {
  if (instrument === "actions") return "action";
  if (instrument === "obligations" || instrument === "mtp") return "obligation";
  return null;
}

/**
 * Flux par classe d'actif entre deux dates, positifs à l'entrée.
 *
 * La trésorerie reçoit le MIROIR de chaque mouvement : l'argent qui entre en
 * actions sort des liquidités. Sans cela, la performance de la poche de
 * trésorerie aurait compté chaque achat de titres comme une perte.
 */
export async function fluxParClasse(
  fundId: string,
  debut: string,
  fin: string,
): Promise<Record<string, Flux[]>> {
  const operations = await loadOperationsMarche(fundId);
  const out: Record<string, Flux[]> = {};
  const poser = (classe: string, date: string, montant: number) => {
    if (montant === 0) return;
    (out[classe] ??= []).push({ date, montant });
  };

  for (const o of operations) {
    const classe = classeDe(o.instrument);
    if (!classe) continue;
    const signe = sensDe(o.description) === "achat" ? 1 : -1;

    for (const e of o.executions) {
      const date = e.dateDenouement;
      if (!date || date < debut || date > fin) continue;
      const montant = montantExecution(o, e);
      if (!Number.isFinite(montant) || montant === 0) continue;
      poser(classe, date, signe * montant);
      poser("tresorerie", date, -signe * montant);
    }
  }

  return out;
}
