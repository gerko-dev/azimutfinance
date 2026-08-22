import ProPageHeader from "@/components/pros/ProPageHeader";
import FundManagementNav from "@/components/pros/fund-management/FundManagementNav";

export const metadata = {
  title: "Fund management — Pro Terminal",
};

export default function FundManagementLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <ProPageHeader
        title="Fund management"
        subtitle="Espace de gestion des fonds : pilotage des portefeuilles, des ordres et du reporting investisseurs."
        breadcrumb={[
          { label: "Pro Terminal", href: "/pros" },
          { label: "Fund management" },
        ]}
        badge="Pro"
      />
      <FundManagementNav />
      <div className="pro-tool">{children}</div>
    </div>
  );
}
