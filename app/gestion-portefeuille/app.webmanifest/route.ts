// === Le module de gestion, installable comme une application ===============
//
// UN SECOND MANIFESTE, ET C'EST TOUT LE SUJET. Le portail en a deja un, a la
// racine : il installe le SITE, page d'accueil comprise. Un gerant ne veut pas
// du site, il veut son poste de travail — et une application qui s'ouvre sur
// les marches, les actualites et l'academie n'est pas un poste de travail.
//
// LA PORTEE FAIT L'APPLICATION. `scope` limite la fenetre a
// /gestion-portefeuille : tout ce qui est dessous reste dans l'application,
// tout ce qui est ailleurs — un lien vers une fiche de titre, vers la cote —
// s'ouvre dans le navigateur. C'est exactement « seulement le module ».
//
// LES DONNEES RESTENT CELLES DU SITE. Rien n'est embarque : l'application est
// une fenetre sur le deploiement, avec sa session Supabase, ses inventaires et
// ses valeurs liquidatives. Une correction poussee en production est dans
// l'application a la seconde suivante, sans rien a reinstaller.
//
// POURQUOI UNE ROUTE ET NON UN FICHIER DANS `public/` : le manifeste porte
// l'identite du module — son nom, ses couleurs, ses raccourcis — et celle-ci
// doit vivre a cote du code du module, pas dans un dossier d'actifs ou
// personne ne la retrouvera.

import type { MetadataRoute } from "next";

// Le bleu marine du pack de marque, comme le manifeste du portail.
const MARINE = "#0A2A5E";

export function GET() {
  const manifeste: MetadataRoute.Manifest = {
    id: "/gestion-portefeuille",
    name: "AzimutFinance — Gestion de portefeuille",
    short_name: "Gestion",
    description:
      "Poste de travail du gérant : inventaires, valeurs liquidatives, allocation, trésorerie, opérations de marché et reporting.",
    // SANS BARRE FINALE, et c'est volontaire : une portee
    // « /gestion-portefeuille/ » ne couvrirait pas « /gestion-portefeuille »
    // lui-meme, et la page d'accueil du module s'ouvrirait dans le navigateur.
    scope: "/gestion-portefeuille",
    start_url: "/gestion-portefeuille",
    display: "standalone",
    orientation: "any",
    background_color: "#f8fafc",
    theme_color: MARINE,
    lang: "fr",
    dir: "ltr",
    categories: ["finance", "business", "productivity"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // LES RACCOURCIS : ce que le gerant ouvre en premier, accessible au clic
    // droit sur l'icone de la barre des taches. Quatre au plus — Windows n'en
    // montre pas davantage.
    shortcuts: [
      {
        name: "Importation",
        short_name: "Importer",
        description: "Charger les inventaires et les valeurs liquidatives",
        url: "/gestion-portefeuille/importation",
      },
      {
        name: "Opérations de marché",
        short_name: "Opérations",
        description: "Saisir et suivre les ordres",
        url: "/gestion-portefeuille/operations-marche",
      },
      {
        name: "Gestion de trésorerie",
        short_name: "Trésorerie",
        description: "Point de trésorerie et relevés",
        url: "/gestion-portefeuille/tresorerie",
      },
      {
        name: "Allocation",
        short_name: "Allocation",
        description: "Allocation validée, proposition et opérations à réaliser",
        url: "/gestion-portefeuille/allocation",
      },
    ],
  };

  return new Response(JSON.stringify(manifeste, null, 2), {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      // UN MANIFESTE CHANGE RAREMENT, mais quand il change — un raccourci
      // ajoute, une couleur corrigee — il faut que le navigateur le revoie
      // sans attendre une journee.
      "Cache-Control": "public, max-age=3600, must-revalidate",
    },
  });
}
