import PagePlaceholder from "@/components/PagePlaceholder";
import { pageMetadata } from "@/lib/seo";

// noindex : page placeholder "à venir", aucun contenu réel — on évite que
// Google indexe une coquille vide qui dégrade l'autorité globale du domaine.
export const metadata = pageMetadata({
  title: "Research sur mesure — Pro",
  description:
    "Rapports personnalisés, études sectorielles approfondies et analyses macro-économiques pour les institutions financières.",
  path: "/pros/research",
  noindex: true,
});

export default function Page() {
  return <PagePlaceholder title="Research sur mesure" badge="Pro" description="Rapports personnalisés, études sectorielles approfondies et analyses macro-économiques." />;
}
