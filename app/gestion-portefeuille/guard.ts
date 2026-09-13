import "server-only";

import { getMyAdminLevel } from "@/lib/admin/auth";

// === Garde de niveau du module ===
//
// Le module vient de /pros/fund-management, une route Pro dont le layout
// n'imposait AUCUN controle ("Acces non restreint pendant le developpement").
// Ses actions ne verifiaient donc que « l'utilisateur est-il connecte ? », et
// cadraient les donnees par `owner_id`.
//
// Depuis la migration, le module est annonce comme reserve au niveau 1. Or la
// garde du layout ne protege que le RENDU des pages : chaque action serveur est
// un point d'entree HTTP appelable directement, sans passer par la page. Sans le
// controle ci-dessous, n'importe quel compte connecte pourrait creer et piloter
// ses propres fonds par appel direct — les donnees d'autrui resteraient hors de
// portee (RLS + owner_id), mais la fonctionnalite ne serait pas restreinte.
//
// Le jour ou le module s'ouvre aux gerants, c'est ce fichier qui change.

export const MSG_NIVEAU1 =
  "Module réservé à l'administrateur de niveau 1.";

export async function estNiveau1(): Promise<boolean> {
  return (await getMyAdminLevel()) === 1;
}
