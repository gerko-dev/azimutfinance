import PagePlaceholder from "@/components/PagePlaceholder";
import { pageMetadata } from "@/lib/seo";

// noindex : page placeholder "à venir".
export const metadata = pageMetadata({
  title: "Place de marché OTC — Pro",
  description:
    "Plateforme exclusive pour professionnels : publication d'offres obligataires de gré à gré, mutualisation des intentions.",
  path: "/pros/otc",
  noindex: true,
});

export default function Page() {
  return <PagePlaceholder title="Place de marché OTC" badge="Pro" description="Plateforme exclusive pour professionnels : publication d'offres obligataires de gré à gré, mutualisation des intentions." />;
}
