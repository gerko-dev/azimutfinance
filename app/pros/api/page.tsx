import PagePlaceholder from "@/components/PagePlaceholder";
import { pageMetadata } from "@/lib/seo";

// noindex : page placeholder "à venir".
export const metadata = pageMetadata({
  title: "API data — Pro",
  description:
    "Accès programmatique aux cotations, émissions, historiques et données de marché UEMOA.",
  path: "/pros/api",
  noindex: true,
});

export default function Page() {
  return <PagePlaceholder title="API data" badge="Pro" description="Accès programmatique aux cotations, émissions, historiques et données de marché UEMOA." />;
}
