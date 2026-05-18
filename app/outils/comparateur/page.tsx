import PagePlaceholder from "@/components/PagePlaceholder";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Comparateur de sociétés — AzimutFinance",
  path: "/outils/comparateur",
});

export default function Page() {
  return <PagePlaceholder title="Comparateur de sociétés" badge="Premium" description="Comparaison côte-à-côte des ratios financiers et indicateurs de valorisation de plusieurs sociétés." />;
}