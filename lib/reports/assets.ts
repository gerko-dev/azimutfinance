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
