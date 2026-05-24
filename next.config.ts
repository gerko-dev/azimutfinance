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
  // Demande explicite aux bots IA de ne pas utiliser ces pages pour
  // l'entrainement, l'indexation IA, l'extraction d'images.
  {
    key: "X-Robots-Tag",
    value: "noai, noimageai, max-snippet:-1, max-image-preview:large",
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
    "/*": ["./certs/**/*"],
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
};

export default nextConfig;
