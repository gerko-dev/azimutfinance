import "server-only";

import { readFileSync } from "fs";
import { join } from "path";

// Images embarquées en base64 dans les PDF (Chromium rend via setContent sans
// base URL : aucune ressource réseau, tout doit être inliné). Mémoïsé.
const _cache = new Map<string, string>();

function pngDataUri(relPath: string): string {
  const cached = _cache.get(relPath);
  if (cached) return cached;
  const buf = readFileSync(join(process.cwd(), relPath));
  const uri = `data:image/png;base64,${buf.toString("base64")}`;
  _cache.set(relPath, uri);
  return uri;
}

/** Logo horizontal blanc sur fond marine (#0A2A5E) — pour bandeaux foncés. */
export function bannerLogoUri(): string {
  return pngDataUri("logo/png/logo-horizontal-fond-sombre.png");
}

/** Logo monochrome marine sur fond transparent, sans baseline — fonds clairs. */
export function logoColorUri(): string {
  return pngDataUri("logo/png/logo-mono-marine.png");
}

/** Visuel de fond de la dernière diapositive du PPT (exporté en PNG). */
export function lastPageBgUri(): string {
  return pngDataUri("lib/reports/assets/last-page-bg.png");
}

/** Logo horizontal couleur (compas + nom + baseline), pour fonds clairs. */
export function logoHorizontalUri(): string {
  return pngDataUri("logo/png/logo-horizontal.png");
}

/**
 * Logo horizontal blanc (compas + nom) en SVG inline, fond marine retiré, donc
 * transparent — pour poser directement sur une photo. Mémoïsé.
 */
export function logoWhiteSvg(): string {
  const rel = "logo/svg/logo-mono-blanc.svg";
  const cached = _cache.get(rel);
  if (cached) return cached;
  let svg = readFileSync(join(process.cwd(), rel), "utf8");
  // Retire le rectangle de fond marine (#0A2A5E) pour ne garder que le tracé blanc.
  svg = svg.replace(/<rect\b[^>]*\/>/gi, (m) => (/#0A2A5E/i.test(m) ? "" : m));
  _cache.set(rel, svg);
  return svg;
}

/**
 * Carte des 8 États de l'UEMOA en SVG inline (frontières Natural Earth 50m
 * projetées), filigrane de la page de garde. Le SVG porte la classe `cmap`.
 * Mémoïsé.
 */
export function uemoaMapSvg(): string {
  const rel = "lib/reports/assets/uemoa-map.svg";
  const cached = _cache.get(rel);
  if (cached) return cached;
  const svg = readFileSync(join(process.cwd(), rel), "utf8");
  _cache.set(rel, svg);
  return svg;
}

/**
 * Drapeau d'un État (SVG inline en data URI) — copies des flags 4x3 de
 * flag-icons dans lib/reports/assets/flags/. Codes attendus : ci, sn, bj, tg,
 * bf, ml, ne, gw. Mémoïsé.
 */
export function flagUri(code: string): string {
  const rel = `lib/reports/assets/flags/${code.toLowerCase()}.svg`;
  const cached = _cache.get(rel);
  if (cached) return cached;
  const svg = readFileSync(join(process.cwd(), rel), "utf8");
  const uri = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  _cache.set(rel, uri);
  return uri;
}
