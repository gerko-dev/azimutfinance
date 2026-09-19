import Lien from "@/components/NavigationProgress";

// === Annonce de remise Premium ===
//
// Ne s'affiche que lorsqu'une remise existe reellement. `pct <= 0` rend null :
// c'est ce qui distingue cette pastille de l'ancien CTA permanent, qui
// sollicitait le visiteur en toutes circonstances. Pas de remise, pas de
// message — l'annonce garde donc sa valeur quand elle parait.
//
// La valeur vient de `pricing_plans.discount_pct`, via `bestDiscountPct()`.
// Un seul emplacement : l'en-tete du site, donc un seul habillage.

export default function PremiumDiscountBadge({
  pct,
  href = "/premium",
  className = "",
}: {
  pct: number;
  href?: string;
  className?: string;
}) {
  if (!pct || pct <= 0) return null;

  const label = `−${pct} % de réduction sur Premium`;

  return (
    <Lien
      href={href}
      title={label}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-sm hover:shadow transition whitespace-nowrap ${className}`}
    >
      <span aria-hidden>★</span>
      {label}
    </Lien>
  );
}
