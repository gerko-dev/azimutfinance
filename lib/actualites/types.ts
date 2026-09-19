// === Types actualités ===

import type { NewsType } from "@/lib/newsTypes";

export type Actualite = {
  id: string;
  ticker: string;
  category: NewsType;
  title: string;
  excerpt: string | null;
  body: string;
  attachment_path: string | null;
  attachment_name: string | null;
  attachment_size_bytes: number | null;
  attachment2_path: string | null;
  attachment2_name: string | null;
  attachment2_size_bytes: number | null;
  source_url: string | null;
  published_at: string | null;
  author_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export const STORAGE_BUCKET = "actualites-attachments";

/**
 * Taille maximale des pièces jointes d'une actualité, TOUTES ENSEMBLE.
 *
 * Ce nombre n'est pas un choix de produit, c'est un plafond de plate-forme.
 * Le formulaire passe par une Server Action, donc le fichier voyage dans le
 * corps de la requête, et deux limites s'appliquent l'une après l'autre :
 *
 *   - Next.js borne le corps d'une Server Action à 1 Mo par défaut. C'est ce
 *     plafond-là qui faisait échouer l'ajout dès 1 Mo, AVANT que le contrôle
 *     applicatif — qui annonçait 20 Mo — ait la moindre chance de s'exécuter.
 *     Il est relevé à 4 Mo dans next.config.ts.
 *   - Vercel refuse tout corps de requête au-delà de 4,5 Mo sur une fonction
 *     serverless, et cette borne-là ne se configure pas.
 *
 * On se cale donc sous la seconde, avec de la marge pour les champs texte du
 * formulaire. Les 20 Mo annoncés jusqu'ici étaient une fiction : rien
 * au-dessus de 1 Mo ne passait.
 *
 * Pour dépasser ces 4 Mo il faudrait cesser de faire transiter le fichier par
 * le serveur — le navigateur téléverserait directement vers Supabase Storage
 * via une URL signée, et la Server Action ne recevrait plus que le chemin.
 */
export const MAX_PIECES_JOINTES_OCTETS = 3_800_000;

/** « 3,6 Mo » — pour les messages destinés au gérant. */
export function formatTaille(octets: number): string {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${(octets / 1024).toFixed(1)} ko`;
  return `${(octets / (1024 * 1024)).toFixed(2)} Mo`;
}
