import "server-only";

import { existsSync, readdirSync } from "fs";
import { join } from "path";
import type { Browser } from "puppeteer-core";

// Sur Vercel / AWS Lambda on utilise le Chromium packagé par @sparticuz/chromium.
// En local on pilote un Chrome/Edge déjà installé (évite de télécharger un
// Chromium complet). Override possible via PUPPETEER_EXECUTABLE_PATH.
const IS_SERVERLESS =
  !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_VERSION;

const LOCAL_CHROME_CANDIDATES = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  process.env.CHROME_PATH,
  // Windows
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  // macOS
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  // Linux
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
].filter(Boolean) as string[];

function findLocalChrome(): string {
  for (const p of LOCAL_CHROME_CANDIDATES) {
    if (existsSync(p)) return p;
  }
  throw new Error(
    "Aucun navigateur Chrome/Edge trouvé en local pour la génération PDF. " +
      "Installez Chrome ou définissez PUPPETEER_EXECUTABLE_PATH.",
  );
}

/**
 * Dossier contenant les archives brotli de @sparticuz/chromium.
 *
 * SANS ARGUMENT, `executablePath()` deduit ce dossier de l'emplacement du
 * module — et se trompe des que le bundler a deplace le paquet. C'est
 * exactement ce que dit l'erreur rencontree en production :
 *
 *   The input directory "/var/task/node_modules/@sparticuz/chromium/bin"
 *   does not exist. […] you must externalize @sparticuz/chromium so it is
 *   not relocated.
 *
 * Le paquet EST declare dans `serverExternalPackages`, mais Turbopack le
 * republie malgre tout sous `.next/node_modules/@sparticuz/chromium-<hash>`,
 * un lien qui resout en local et pas dans la fonction deployee. On cesse donc
 * de laisser la bibliotheque deviner : on lui passe le dossier, choisi parmi
 * les emplacements possibles, le premier qui existe VRAIMENT.
 *
 * Si aucun ne repond, on leve une erreur qui NOMME les chemins essayes : la
 * prochaine panne livrera la disposition reelle du bundle au lieu d'un message
 * generique.
 */
function dossierBinChromium(): string {
  const candidats: string[] = [
    // Emplacement nominal : c'est celui que next.config.ts fait tracer.
    join(process.cwd(), "node_modules", "@sparticuz", "chromium", "bin"),
  ];

  // Republication Turbopack : le nom porte un hash, donc on le cherche au lieu
  // de le coder en dur.
  const republie = join(process.cwd(), ".next", "node_modules", "@sparticuz");
  try {
    for (const entree of readdirSync(republie)) {
      if (entree.startsWith("chromium")) candidats.push(join(republie, entree, "bin"));
    }
  } catch {
    // Dossier absent : ce n'est pas une anomalie, seulement un candidat en
    // moins.
  }

  for (const c of candidats) {
    if (existsSync(c)) return c;
  }
  throw new Error(
    "Archives Chromium introuvables. Emplacements essayés : " +
      candidats.join(" | ") +
      ` (process.cwd() = ${process.cwd()})`,
  );
}

async function launchBrowser(): Promise<Browser> {
  const puppeteer = (await import("puppeteer-core")).default;
  if (IS_SERVERLESS) {
    const chromium = (await import("@sparticuz/chromium")).default;
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(dossierBinChromium()),
      headless: true,
    });
  }
  return puppeteer.launch({
    executablePath: findLocalChrome(),
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
}

/**
 * Rend un document HTML complet en PDF A4, fond imprimé.
 * Le HTML doit embarquer son propre CSS (aucune ressource réseau requise) ;
 * l'orientation est gouvernée par le `@page { size }` du CSS (preferCSSPageSize)
 * mais on passe aussi `landscape` en repli. Paysage par défaut.
 */
export async function htmlToPdf(
  html: string,
  opts: { landscape?: boolean } = {},
): Promise<Buffer> {
  const { landscape = true } = opts;
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "A4",
      landscape,
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

/**
 * Rend un document HTML en image matricielle (PNG ou JPEG), à dimensions fixes.
 * Le `<body>` doit mesurer exactement `width`×`height` (px CSS) : on capture la
 * fenêtre entière. `scale` augmente la résolution (deviceScaleFactor).
 */
export async function htmlToImage(
  html: string,
  opts: {
    width: number;
    height: number;
    format?: "png" | "jpeg";
    quality?: number;
    scale?: number;
  },
): Promise<Buffer> {
  const { width, height, format = "png", quality = 92, scale = 2 } = opts;
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: scale });
    await page.setContent(html, { waitUntil: "load" });
    const shot = await page.screenshot({
      type: format,
      ...(format === "jpeg" ? { quality } : {}),
      clip: { x: 0, y: 0, width, height },
    });
    return Buffer.from(shot);
  } finally {
    await browser.close();
  }
}
