import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "flag-icons/css/flag-icons.min.css";
import Footer from "@/components/Footer";
import CookieConsent from "@/components/CookieConsent";
import {
  SITE_URL,
  SITE_NAME,
  SITE_DESCRIPTION,
  organizationJsonLd,
  webSiteJsonLd,
} from "@/lib/seo";

// Repli explicite : si Geist ne peut pas être téléchargé (réseau / Google Fonts
// bloqué), on retombe sur des polices système de métriques comparables plutôt
// que sur un défaut serif surdimensionné.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  fallback: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "Liberation Mono", "monospace"],
});

const TITLE = "AzimutFinance — Le portail des marchés financiers UEMOA (BRVM)";

export const metadata: Metadata = {
  // Base absolue : sans elle, les URLs Open Graph / canoniques restent
  // relatives et inexploitables par les crawlers.
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: "KOUAME N'Guessan Brou Germain" }],
  creator: "KOUAME N'Guessan Brou Germain",
  publisher: SITE_NAME,
  category: "finance",
  // Pas de `alternates.canonical` ici : un canonical pose dans le layout
  // racine est herite par TOUTES les pages enfants qui ne le surchargent
  // pas, ce qui revient a declarer la home comme canonique pour tout le
  // site (cf. Google Search Console "Autre page avec balise canonique
  // correcte"). Chaque page publique pose son propre canonical via
  // pageMetadata() ou alternates.canonical.
  formatDetection: { telephone: false, email: false, address: false },
  openGraph: {
    type: "website",
    locale: "fr_FR",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: TITLE,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {/* Donnees structurees marque — aident Google a identifier l'editeur. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(organizationJsonLd()),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(webSiteJsonLd()),
          }}
        />
        <div className="flex-1">{children}</div>
        <Footer />
        <CookieConsent />
      </body>
    </html>
  );
}
