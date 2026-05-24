import "server-only";

import { existsSync } from "fs";
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

async function launchBrowser(): Promise<Browser> {
  const puppeteer = (await import("puppeteer-core")).default;
  if (IS_SERVERLESS) {
    const chromium = (await import("@sparticuz/chromium")).default;
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
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
