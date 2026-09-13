// Référentiel des composantes de benchmark (hors indices actions BRVM, gérés
// à part car ils dépendent d'un loader serveur). Valeurs encodées + libellés.
//
// Encodage des `value` :
//   "Taux pension BCEAO"        → taux directeur BCEAO (portage)
//   "Inflation UEMOA"           → inflation glissement annuel (portage)
//   "sovy:{PAYS}:{N}"           → rendement souverain moyen ~N ans (portage)
//   "sovc:{PAYS}:{N}"           → taux facial (coupon) souverain moyen ~N ans
//   "oblcote:{PAYS}"            → rendement (coupon pondéré) des obligations cotées
//   "obldefaut"                 → rendement obligataire par défaut (souverain UEMOA global)
// PAYS ∈ {CI,BJ,BF,ML,NE,SN,TG,GW,UEMOA}.

export type BenchOption = { value: string; label: string; group?: string };

export const UEMOA_COUNTRIES: { code: string; name: string }[] = [
  { code: "CI", name: "Côte d'Ivoire" },
  { code: "BJ", name: "Bénin" },
  { code: "BF", name: "Burkina Faso" },
  { code: "ML", name: "Mali" },
  { code: "NE", name: "Niger" },
  { code: "SN", name: "Sénégal" },
  { code: "TG", name: "Togo" },
  { code: "GW", name: "Guinée-Bissau" },
];

// Nom complet du pays depuis son code (UEMOA = ensemble).
export function countryName(code: string): string {
  if (code === "UEMOA") return "UEMOA";
  return UEMOA_COUNTRIES.find((c) => c.code === code)?.name ?? code;
}

export const BENCH_MATURITIES = [5, 4, 3, 2] as const;

// Options benchmark hors indices actions (taux, souverains, obligataire).
export function bondBenchmarkOptions(): BenchOption[] {
  const opts: BenchOption[] = [
    { value: "Taux pension BCEAO", label: "Taux directeur BCEAO", group: "Taux & monétaire" },
    { value: "Inflation UEMOA", label: "Inflation UEMOA (glissement annuel)", group: "Taux & monétaire" },
  ];
  const countries = [...UEMOA_COUNTRIES, { code: "UEMOA", name: "UEMOA (ensemble)" }];

  for (const c of countries)
    for (const n of BENCH_MATURITIES)
      opts.push({
        value: `sovy:${c.code}:${n}`,
        label: `Rendement souverain ${n} ans — ${c.name}`,
        group: "Souverain — rendement",
      });

  for (const c of countries)
    for (const n of BENCH_MATURITIES)
      opts.push({
        value: `sovc:${c.code}:${n}`,
        label: `Taux facial ${n} ans — ${c.name}`,
        group: "Souverain — taux facial",
      });

  for (const c of countries)
    opts.push({
      value: `oblcote:${c.code}`,
      label: `Obligations cotées — ${c.name}`,
      group: "Obligations cotées",
    });

  opts.push({
    value: "obldefaut",
    label: "Rendement obligataire par défaut",
    group: "Obligations",
  });

  return opts;
}
