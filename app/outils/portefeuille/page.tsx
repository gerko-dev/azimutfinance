import PagePlaceholder from "@/components/PagePlaceholder";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Portefeuille personnel — AzimutFinance",
  path: "/outils/portefeuille",
});

export default function Page() {
  return <PagePlaceholder title="Portefeuille personnel" badge="Bientôt" description="Suivez votre portefeuille en temps réel : P&L, allocation, performance." />;
}