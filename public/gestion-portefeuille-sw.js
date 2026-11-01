// === Service worker du module de gestion ==================================
//
// IL EXISTE PARCE QUE CHROME ET EDGE L'EXIGENT. Sans un service worker qui
// intercepte les requetes, aucun des deux ne propose « Installer cette
// application » : c'est la condition, pas un choix d'architecture.
//
// IL NE MET RIEN EN CACHE, ET C'EST DELIBERE. Un service worker qui cacherait
// servirait une valeur liquidative d'hier comme celle du jour, un inventaire
// perime comme l'arrete courant, un solde bancaire depasse comme le solde
// reel. Sur un poste de gestion, une donnee financiere perimee affichee sans
// avertissement est pire que pas de donnee du tout : on ne la soupconne pas.
//
// IL NE FAIT DONC QU'UNE CHOSE : laisser passer, et dire clairement quand le
// reseau manque. L'application est une fenetre sur le site, elle n'en est pas
// une copie.

const MESSAGE_HORS_LIGNE = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hors ligne — Gestion de portefeuille</title>
<style>
  :root { color-scheme: light; }
  body { margin:0; min-height:100vh; display:flex; align-items:center;
         justify-content:center; background:#f8fafc; color:#0f172a;
         font:14px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width:30rem; padding:2rem; text-align:center; }
  h1 { font-size:1.1rem; margin:0 0 .75rem; color:#0A2A5E; }
  p { margin:0 0 1rem; color:#475569; }
  button { font:inherit; font-weight:600; padding:.55rem 1.1rem; border-radius:.375rem;
           border:1px solid #cbd5e1; background:#fff; color:#0f172a; cursor:pointer; }
  button:hover { background:#f1f5f9; }
</style></head>
<body><main>
  <h1>Connexion indisponible</h1>
  <p>Le module de gestion travaille sur les données du site : inventaires,
     valeurs liquidatives, carnet d'ordres. Il lui faut donc le réseau.</p>
  <p>Rien n'a été perdu — une saisie en cours est restée dans la page
     précédente.</p>
  <button onclick="location.reload()">Réessayer</button>
</main></body></html>`;

self.addEventListener("install", (e) => {
  // ACTIF TOUT DE SUITE : sans cela, la premiere installation demande au
  // gerant de fermer puis rouvrir la fenetre pour que l'application existe.
  e.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      // UNE VERSION PRECEDENTE A PU METTRE EN CACHE. Ce service worker-ci
      // n'en cree aucun ; on efface ce qui pourrait trainer, sans quoi une
      // reponse ancienne survivrait a la mise a jour.
      const noms = await caches.keys();
      await Promise.all(noms.map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const requete = event.request;

  // On ne se mele que de ce qui nous regarde : meme origine, methode GET.
  // Une action serveur, un envoi de fichier, un appel a Supabase passent
  // directement — s'interposer n'apporterait rien et pourrait casser.
  if (requete.method !== "GET") return;
  if (new URL(requete.url).origin !== self.location.origin) return;

  // RESEAU, TOUJOURS. Le repli ne sert qu'a remplacer la page d'erreur du
  // navigateur, qui dans une fenetre d'application sans barre d'adresse ne dit
  // rien d'utile et ne propose rien.
  event.respondWith(
    fetch(requete).catch(() => {
      if (requete.mode === "navigate") {
        return new Response(MESSAGE_HORS_LIGNE, {
          status: 503,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }
      return Response.error();
    }),
  );
});
