import PagePlaceholder from "@/components/PagePlaceholder";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Private equity — AzimutFinance",
  path: "/marches/private-equity",
});

export default function Page() {
  return (
    <PagePlaceholder
      title="Private equity"
      badge="Bientôt"
      description="Capital-investissement en zone UEMOA : fonds actifs, opérations annoncées et sociétés en portefeuille."
    />
  );
}
