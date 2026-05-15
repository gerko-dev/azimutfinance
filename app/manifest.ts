import type { MetadataRoute } from "next";
import { SITE_NAME, SITE_DESCRIPTION } from "@/lib/seo";

/**
 * Manifest PWA. Permet l'installation du portail comme application et fournit
 * aux moteurs/navigateurs le nom, les couleurs de marque et les icones.
 * Couleurs issues du pack de marque : bleu marine #0A2A5E.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AzimutFinance — Marchés financiers UEMOA",
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0A2A5E",
    lang: "fr",
    categories: ["finance", "business", "news"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
