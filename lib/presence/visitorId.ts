// Identifiant de visiteur anonyme, stable et persistant (localStorage).
// Permet de compter les visiteurs NON connectés dans le suivi de présence
// (cf. presence_ping_v2). Ce n'est pas un identifiant de compte : il est
// purement local au navigateur et n'est rattaché à aucune donnée personnelle.

const STORAGE_KEY = "af_visitor_id";

/**
 * Retourne l'identifiant de visiteur du navigateur courant, en le générant au
 * premier appel. Renvoie "" si localStorage est indisponible (navigation
 * privée stricte) — dans ce cas le visiteur anonyme n'est simplement pas suivi.
 */
export function getVisitorId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = window.localStorage.getItem(STORAGE_KEY);
    if (!id || id.length < 8) {
      id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
      window.localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}
