import type { NextConfig } from "next";

// ─── HEADERS DE SECURITE ──────────────────────────────────────────────────
// Appliques a TOUTES les routes. Renforce :
//  - blocage iframe externe (clickjacking + leakage)
//  - non-sniff content-type
//  - referrer minimum
//  - X-Robots-Tag noai/noimageai pour decourager l'entrainement IA
//    (en complement de robots.txt — certains bots respectent l'un mais pas
//    l'autre).
//  - permissions-policy : aucun accès camera/micro/geo demande par le site.
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // frame-ancestors duplique X-Frame-Options pour les navigateurs modernes.
  // upgrade-insecure-requests force HTTPS sur les sous-ressources.
  {
    key: "Content-Security-Policy",
    value:
      "frame-ancestors 'self'; " +
      "upgrade-insecure-requests; " +
      "base-uri 'self'; " +
      "form-action 'self'",
  },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), accelerometer=(), gyroscope=()",
  },
  // Directives X-Robots-Tag pour les moteurs de recherche : on autorise
  // explicitement les snippets et previews d'images larges. L'opt-out IA
  // (Google-Extended, GPTBot, ClaudeBot, etc.) est gere via robots.txt
  // — noai/noimageai ne sont PAS reconnus par Google et polluaient
  // inutilement l'entete (cf. /admin/seo).
  {
    key: "X-Robots-Tag",
    value: "max-snippet:-1, max-image-preview:large",
  },
  // Indique a Cloudflare/Vercel que la reponse contient des donnees
  // sensibles a ne pas partager dans les CDN publics (best-effort).
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  // Bundle the brvm.org TLS intermediate with serverless functions so
  // NODE_EXTRA_CA_CERTS can resolve it at runtime on Vercel.
  // brvm.org sends only the leaf cert; without this intermediate the live
  // scraper fails with UNABLE_TO_VERIFY_LEAF_SIGNATURE.
  outputFileTracingIncludes: {
    // Le bulletin statistique BCEAO est lu au RUNTIME par lib/tauxLoader, via
    // join(process.cwd(), "data", ...). Le traceur de fichiers suit mal un
    // chemin compose a partir de process.cwd() : le PDF peut rester hors du
    // bundle serverless alors qu'il est bien versionne. La page « Taux UEMOA »
    // s'affiche alors normalement et entierement vide, puisque le chargeur
    // renvoie un tableau vide quand la source manque.
    //
    // Sur "/*" et non sur les seules routes concernees : le bulletin alimente
    // aussi le taux sans risque du MEDAF (onglets Analyse et Portefeuille
    // optimal), l'espace Pro et une route d'API. 665 Ko sur chaque fonction
    // coutent moins cher qu'une liste de routes qu'on oubliera de tenir a jour.
    // Le motif se termine par « /**/* » et non par « /** » : c'est la forme
    // qui designe des FICHIERS, la seule que le traceur retienne — celle du
    // certificat juste au-dessus, qui fonctionne. Une premiere tentative en
    // « /** » n'avait rien embarque du tout.
    // pdfjs-dist est marque `serverExternalPackages` : il est charge depuis
    // node_modules au runtime, et seuls les fichiers que le traceur a vus s'y
    // trouvent. Le worker n'etant jamais importe — pdfjs le resout par chemin
    // relatif — il manquait, d'ou « Setting up fake worker failed » en
    // production. L'import explicite ajoute dans lib/tauxPdfParser devrait
    // suffire ; cette inclusion est la ceinture de la bretelle, le sujet ayant
    // deja coute trois deploiements.
    "/*": [
      "./certs/**/*",
      "./data/marche-monetaire/**/*",
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
    ],
    // @sparticuz/chromium stocke le binaire Chromium (brotli) dans bin/ ;
    // ces fichiers ne sont pas "importés" donc le tracer ne les inclut pas
    // seul. On les force pour la route de génération PDF sur Vercel.
    "/admin/rapports/cotation/pdf": [
      "./node_modules/@sparticuz/chromium/bin/**",
      // Images inlinées dans le PDF (logo bandeau + fond dernière page) : lues
      // via fs au runtime, donc non tracées automatiquement.
      "./logo/png/logo-horizontal-fond-sombre.png",
      "./lib/reports/assets/**",
    ],
    "/admin/rapports/commodities/pdf": [
      "./node_modules/@sparticuz/chromium/bin/**",
      "./logo/png/logo-horizontal-fond-sombre.png",
      "./lib/reports/assets/**",
    ],
  },
  // pdfjs-dist spawns a worker that resolves its sibling pdf.worker.mjs by
  // relative path. Turbopack/webpack hoist the bundle into .next/, which
  // breaks that resolution. Keep pdfjs-dist external so it loads directly
  // from node_modules at runtime.
  // puppeteer-core / @sparticuz/chromium : externes pour charger le binaire
  // depuis node_modules au runtime (sinon résolution du chemin cassée).
  serverExternalPackages: ["pdfjs-dist", "puppeteer-core", "@sparticuz/chromium"],

  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },

  // Redirections permanentes (308) gerees au niveau edge Vercel — preferables
  // au `redirect()` dans une page server component (qui sort un 307 temporaire,
  // ce que Google garde longtemps dans son index sous "Page avec redirection").
  // Toutes ces routes ont ete deplacees dans la zone /pros lors de la refonte.
  async redirects() {
    return [
      // Les deux simulateurs ont rejoint l'espace Outils : le YTM quitte le Pro
      // Terminal, celui d'adjudication quitte la section souverains. Leurs
      // anciennes URL sont indexees et liees depuis l'exterieur.
      {
        source: "/outils/ytm",
        destination: "/outils/simulateur-ytm",
        permanent: true,
      },
      {
        source: "/pros/ytm",
        destination: "/outils/simulateur-ytm",
        permanent: true,
      },
      {
        source: "/marches/souverains-non-cotes/simulateur",
        destination: "/outils/simulateur-adjudication",
        permanent: true,
      },
      // Le suivi de compte titre etait loge sous Academie, ou il n'avait rien a
      // faire : c'est un outil de gestion, pas un contenu pedagogique. Ses URL
      // sont indexees et les utilisateurs les ont en favori.
      {
        source: "/academie/compte-titre",
        destination: "/outils/portefeuille",
        permanent: true,
      },
      {
        source: "/academie/compte-titre/:path*",
        destination: "/outils/portefeuille/:path*",
        permanent: true,
      },
      // L'ancien /outils/screener pointait vers le Pro Terminal. Le screener
      // actions est revenu dans l'espace Outils, en acces Premium : la
      // redirection doit suivre, sinon elle renverrait les liens indexes vers
      // une page reservee aux comptes Pro.
      {
        source: "/outils/screener",
        destination: "/outils/screener-actions",
        permanent: true,
      },
      {
        source: "/pros/terminal",
        destination: "/pros",
        permanent: true,
      },
      {
        source: "/pros/fund-management",
        destination: "/gestion-portefeuille",
        permanent: true,
      },
      {
        source: "/pros/fund-management/:path*",
        destination: "/gestion-portefeuille/:path*",
        permanent: true,
      },
      // Devises et matieres premieres etaient sous /macro : elles relevent des
      // marches, pas de la macroeconomie, et le menu les y a placees. Les
      // anciennes URL sont indexees — redirection permanente, sous-chemins
      // compris (fiches par paire et par produit).
      {
        source: "/macro/devises",
        destination: "/marches/devises",
        permanent: true,
      },
      {
        source: "/macro/devises/:path*",
        destination: "/marches/devises/:path*",
        permanent: true,
      },
      {
        source: "/macro/matieres-premieres",
        destination: "/marches/matieres-premieres",
        permanent: true,
      },
      {
        source: "/macro/matieres-premieres/:path*",
        destination: "/marches/matieres-premieres/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
