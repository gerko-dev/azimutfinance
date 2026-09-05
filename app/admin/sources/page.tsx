import { requireAdmin } from "@/lib/admin/auth";
import { checkListedBondsVsBoc } from "@/lib/dataLoader";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sources & méthodologies — Admin",
};

export default async function SourcesPage() {
  await requireAdmin(1);
  const bocCheck = checkListedBondsVsBoc();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Sources &amp; méthodologies
        </h1>
        <p className="text-sm text-slate-500 mt-1 max-w-3xl">
          Référentiel interne des sources de données et conventions de calcul du site.
          L&apos;UI publique ne mentionne plus que les institutions officielles (BCEAO,
          UMOA-Titres, BRVM, DC/BR, BAD, FMI, Banque mondiale, INS nationaux). Tout le
          reste — sources tierces, scrapers, formules — est documenté ici pour le super-admin.
        </p>
      </div>

      {/* =====================================================================
          0. COHERENCE REFERENTIEL OBLIGATAIRE <-> BOC
          Rapprochement quotidien, sans telechargement : data/obligations-
          cotees-vn-boc.csv est produit chaque soir par scrape_brvm_boc.py, et
          y figurer signifie "cotee au BOC de cette date".
      ===================================================================== */}
      <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-5">
        <div className="flex items-baseline justify-between flex-wrap gap-2 mb-1">
          <h2 className="text-base font-semibold text-slate-900">
            Cohérence référentiel obligataire ↔ BOC
          </h2>
          <span className="text-xs text-slate-500">
            BOC du {bocCheck.bocDate ?? "—"} · {bocCheck.quotedCount} cotées ·{" "}
            {bocCheck.baseCount} en base
          </span>
        </div>

        {bocCheck.maturedButQuoted.length > 0 ? (
          <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-3">
            <div className="text-sm font-medium text-rose-800">
              {bocCheck.maturedButQuoted.length} obligation
              {bocCheck.maturedButQuoted.length > 1 ? "s" : ""} déclarée
              {bocCheck.maturedButQuoted.length > 1 ? "s" : ""} échue
              {bocCheck.maturedButQuoted.length > 1 ? "s" : ""} mais toujours cotée
              {bocCheck.maturedButQuoted.length > 1 ? "s" : ""} au BOC
            </div>
            <p className="text-xs text-rose-700 mt-1">
              La BRVM ne cote pas une ligne remboursée : la date d&apos;échéance
              du référentiel est donc fausse. Corriger{" "}
              <code>data/obligations-cotees.csv</code>.
            </p>
            <ul className="mt-2 space-y-1">
              {bocCheck.maturedButQuoted.map((b) => (
                <li key={b.code} className="text-xs text-rose-900">
                  <code className="font-mono">{b.code}</code> — échéance saisie{" "}
                  {b.maturityDate} — {b.name}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-3 text-xs text-slate-500">
            Aucune obligation échue en base n&apos;est encore cotée au BOC.
          </p>
        )}

        {bocCheck.quotedButMissing.length > 0 && (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3">
            <div className="text-sm font-medium text-amber-800">
              {bocCheck.quotedButMissing.length} obligation
              {bocCheck.quotedButMissing.length > 1 ? "s" : ""} cotée
              {bocCheck.quotedButMissing.length > 1 ? "s" : ""} au BOC, absente
              {bocCheck.quotedButMissing.length > 1 ? "s" : ""} du référentiel
            </div>
            <p className="text-xs text-amber-700 mt-1">
              Nouvelles émissions à saisir — aucun script ne crée de ligne
              automatiquement.
            </p>
            <p className="mt-2 text-xs font-mono text-amber-900">
              {bocCheck.quotedButMissing.join(" · ")}
            </p>
          </div>
        )}
      </section>

      {/* =====================================================================
          1. INSTITUTIONS OFFICIELLES (visibles dans l'UI publique)
      ===================================================================== */}
      <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-5">
        <h2 className="text-base font-semibold text-slate-900 mb-3">
          Institutions officielles — visibles publiquement
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <OfficialCard
            name="BCEAO"
            scope="Banque centrale UEMOA"
            usage="Taux directeurs, agrégats monétaires (M1/M2/M3), inflation IHPC, balance des paiements, statistiques pays, bulletin mensuel de statistiques."
            ingestion="PDF mensuel (data/marche-monetaire/Bul_stat.pdf) importé depuis /admin/data et parsé via lib/tauxPdfParser.ts. Source unique, sans fallback."
            pages="/marche-monetaire, /macro/pays, /macro/devises (peg EUR/XOF)"
          />
          <OfficialCard
            name="UMOA-Titres"
            scope="Agence régionale des titres publics UEMOA"
            usage="Adjudications souverains (OAT/BAT), émissions, calendrier primaire, rendements primaires par maturité."
            ingestion="scripts/scrape_umoa_emissions.py → data/emissions.csv + data/umoa-emissions-*.csv. Cron à confirmer."
            pages="/marches/souverains-non-cotes, /marche-monetaire/mtp, /obligation/[isin]"
          />
          <OfficialCard
            name="BRVM / DC-BR"
            scope="Bourse Régionale des Valeurs Mobilières / Dépositaire central"
            usage="Cours actions et obligations cotées (différés ~15 min), indices BRVMC/BRVM30/sectoriels, capitalisations, volumes."
            ingestion="Snapshot BRVM via lib/brvm/* — la BRVM diffuse en différé ~15 min, cache applicatif 5 min par-dessus. Pas de scraping CSV : l'API BRVM est consommée à la volée."
            pages="/marches/actions, /marches/obligations, /titre/[code], /obligation/[isin]"
          />
          <OfficialCard
            name="BAD · FMI · Banque mondiale · INS"
            scope="Institutions multilatérales + offices nationaux de statistiques"
            usage="Données macro pays, frameworks méthodologiques (BP6 du FMI, SCN08, IHPC harmonisé), indicateurs de développement."
            ingestion="Pas encore branché directement. Citations indirectes via BCEAO qui compile selon ces frameworks."
            pages="/macro/pays (citation BP6 retirée de l'UI mais conservée dans la donnée)"
          />
        </div>
      </section>

      {/* =====================================================================
          2. SOURCES TIERCES (retirées de l'UI publique)
      ===================================================================== */}
      <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-5">
        <h2 className="text-base font-semibold text-slate-900 mb-3">
          Sources tierces — non visibles publiquement
        </h2>
        <p className="text-xs text-slate-500 mb-3">
          Sources commerciales ou agrégateurs privés. Citation retirée de l&apos;UI pour
          éviter d&apos;exposer la dépendance à des tiers et minimiser les risques juridiques /
          de traçabilité. Les données restent identifiables techniquement via les scrapers ci-dessous.
        </p>
        <div className="space-y-3">
          <ThirdPartyRow
            name="Investing.com"
            data="13 paires FX + 8 matières premières + DXY"
            mechanism="API JSON publique api.investing.com/api/financialdata/historical/<id> (curl + bon Referer). 20 ans d&apos;historique, chunks de 4 ans (cap 5000 lignes/réponse)."
            scrapers="scripts/scrape_investing_fx.py · scripts/scrape_investing_commodities.py"
            schedule="GitHub Actions .github/workflows/scrape-investing.yml — cron quotidien 08h00 et 17h30 UTC"
            csvs="data/USD_XOF.csv, EUR_USD.csv, US_Dollar_Index.csv, Cacao.csv, brent.csv, etc."
          />
          <ThirdPartyRow
            name="ICE · NYMEX · COMEX · Bursa Malaysia · SGX"
            data="Marchés boursiers tiers où sont cotés cacao/café/sucre (ICE), WTI (NYMEX), or (COMEX), huile de palme (Bursa MY), TSR caoutchouc (SGX)"
            mechanism="Pas d&apos;accès direct. Données ré-empaquetées par Investing.com (cf. ci-dessus)."
            scrapers="—"
            schedule="—"
            csvs="—"
          />
          <ThirdPartyRow
            name="Sikafinance"
            data="Historique OHLC + volumes actions BRVM (jusqu'à 20 ans)"
            mechanism="Scraping HTML page par titre."
            scrapers="scripts/scrape_sika_history.py"
            schedule="Manuel / cron à confirmer"
            csvs="data/historique_sika/*.csv"
          />
          <ThirdPartyRow
            name="BOC (Bulletin Officiel de la Cote)"
            data="VL FCP, encours, composition, opérations corporate (dividendes, splits, augmentations de capital)"
            mechanism="Publication officielle BRVM/DC-BR (PDF) mais traitement = scraping/parsing maison."
            scrapers="scripts/scrape_brvm_boc.py"
            schedule=".github/workflows/scrape-boc.yml"
            csvs="data/fcp/*.csv"
          />
          <ThirdPartyRow
            name="Sociétés de gestion (SGO) UEMOA"
            data="Encours, performances et composition FCP publiés trimestriellement"
            mechanism="Données extraites du BOC ci-dessus. Pas de scraping direct des SGO."
            scrapers="—"
            schedule="—"
            csvs="data/fcp/*.csv"
          />
          <ThirdPartyRow
            name="RichBourse"
            data="Calendrier corporate UEMOA (assemblées, ex-dividendes, augmentations de capital)"
            mechanism="Scraping HTML."
            scrapers="scripts/scrape_richbourse_calendrier.py"
            schedule="Manuel / cron à confirmer"
            csvs="data/calendrier-*.csv"
          />
          <ThirdPartyRow
            name="CoinAfrique · Jiji"
            data="Annonces immobilier Abidjan (achat + location)"
            mechanism="Scraping HTML des marketplaces."
            scrapers="scripts/coinafrique.py · scripts/jiji.py · scripts/scrape_immo.py · scripts/enrich_immo.py"
            schedule="Manuel"
            csvs="data/immobilier-*.csv"
          />
        </div>
      </section>

      {/* =====================================================================
          3. MÉTHODOLOGIES (retirées de l'UI publique)
      ===================================================================== */}
      <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-5">
        <h2 className="text-base font-semibold text-slate-900 mb-3">
          Méthodologies de calcul — non visibles publiquement
        </h2>
        <p className="text-xs text-slate-500 mb-3">
          Toutes les conventions de calcul affichées auparavant en pied de page (matières
          premières, devises, obligations, FCP) sont rapatriées ici. Le code reste la
          source de vérité — ce panneau est un rappel synthétique pour l&apos;admin.
        </p>

        <div className="space-y-4 text-sm text-slate-700">
          <Method title="Performance multi-horizons (matières premières, devises, actions)">
            <p>
              Calculée du dernier cours disponible (date_max) en remontant de N jours
              calendaires. Recherche binaire du point antérieur le plus proche.
            </p>
            <p>
              <strong>YTD</strong> = depuis le 1ᵉʳ janvier de l&apos;année du dernier cours
              (premier point ≥ <code>YYYY-01-01</code>).
            </p>
            <p className="text-xs text-slate-500">
              Code : <code>lib/fx.ts::computeFxStats</code>, <code>lib/commodities.ts</code>.
            </p>
          </Method>

          <Method title="Volatilité 1A (cours quotidiens)">
            <p>
              Écart-type des log-rendements quotidiens sur la fenêtre 1 an glissante,
              annualisé par √252. Les rendements aberrants (|r| ≥ 0,4 = ±40 %/jour) sont
              filtrés pour ignorer les gaps techniques.
            </p>
          </Method>

          <Method title="Drawdown vs PH 5A">
            <p>
              Recul du dernier cours vs le plus haut atteint sur la fenêtre 5 ans
              glissants. Exprimé en %.
            </p>
          </Method>

          <Method title="z-score 1A">
            <p>
              Écart entre le cours actuel et la moyenne 1 an, exprimé en écarts-types
              (niveau, pas log-rendement). |z| &gt; 2 = niveau extrême statistiquement.
            </p>
          </Method>

          <Method title="Saisonnalité 10 ans">
            <p>
              Rendement mensuel close-to-close agrégé sur les 10 dernières années
              calendaires, par mois (jan…déc). Indicateurs : moyenne et hit rate
              (proportion de mois positifs).
            </p>
          </Method>

          <Method title="Indice TWI FCFA (trade-weighted index)">
            <p>
              Panier géométrique pondéré par la part de chaque partenaire dans le
              commerce extérieur UEMOA hors zone euro. EUR exclu (peg à 655,957 FCFA
              donc neutre). Une hausse de l&apos;indice = appréciation effective nominale
              du FCFA.
            </p>
            <p>
              Formule : <code>TWI(t) = 100 × exp(Σ w_i × ln(X_i(0) / X_i(t)) / Σ w_i)</code>{" "}
              où w_i est la pondération commerciale et X_i la parité X_i/XOF à l&apos;instant t.
            </p>
            <p className="text-xs text-slate-500">
              Code : <code>lib/fx.ts::buildFcfaTradeWeightedIndex</code>. Pondérations dans <code>FCFA_BASKET</code>.
            </p>
          </Method>

          <Method title="Cross-rates synthétiques (paires XOF)">
            <p>
              <code>X/Y = (X/XOF) / (Y/XOF)</code>. Utilisé pour reconstituer toute paire
              non scrappée à partir des cours XOF disponibles (ex CNY/XOF via USD/XOF ÷ USD/CNY).
            </p>
          </Method>

          <Method title="Pricing actuariel obligataire (convention Act/365)">
            <p>
              Day count <strong>Actual/365 Fixed</strong>. YTM résolu par bisection à partir du
              clean price ; duration Macaulay et modifiée, convexité, intérêts courus.
            </p>
            <p>
              <strong>Souverains (UMOA-Titres)</strong> : coupon annuel sur capital
              restant dû ; amortissement linéaire, in-fine, ou BAT zéro-coupon. Différé
              d&apos;amortissement pris en compte.
            </p>
            <p>
              <strong>Obligations cotées BRVM</strong> : pipeline séparé qui gère les amortissements IF/AC/ACD,
              reconstruit le nominal initial à partir de l&apos;encours restant, et calibre la
              courbe théorique sur les adjudications UMOA-Titres primaires.
            </p>
            <p className="text-xs text-slate-500">
              Code : <code>lib/bondMath.ts</code> (Bond simple) et <code>lib/bondsUEMOA.ts</code> (ListedBond avec amortissement).
            </p>
          </Method>

          <Method title="Spread de signature (obligations cotées)">
            <p>
              Écart entre le YTM observé sur le marché secondaire BRVM et la courbe
              primaire UMOA-Titres du pays émetteur, interpolée à la maturité résiduelle.
              Mesure la prime exigée par le marché pour la signature vs son benchmark
              souverain.
            </p>
            <p className="text-xs text-slate-500">
              Code : <code>lib/listedBondsTypes.ts::calculateSignatureSpread</code>.
            </p>
          </Method>

          <Method title="Rendement brut immobilier">
            <p>
              Loyer annuel médian ÷ prix d&apos;achat médian, par localité. Calculé uniquement
              là où achat ET location coexistent dans la même localité (sinon non significatif).
            </p>
          </Method>

          <Method title="FCP — pas d'indicateurs de risque">
            <p>
              Volatilité, ratio de Sharpe, drawdown <strong>volontairement non calculés</strong> :
              la fréquence de publication des VL est hétérogène entre fonds (mensuelle,
              trimestrielle, irrégulière). Ces métriques ne refléteraient pas la réalité.
              Seuls les indicateurs d&apos;encours et de performance brute sont affichés.
            </p>
          </Method>

          <Method title="Régression vs BRVM Composite (actions)">
            <p>
              Beta, alpha, R², up/down capture calculés par OLS sur log-rendements
              mensuels vs BRVMC, fenêtre 3 ans glissants. Tracking error = écart-type des
              rendements excédentaires annualisé.
            </p>
          </Method>
        </div>
      </section>

      <p className="text-xs text-slate-400 italic">
        Cette page n&apos;est pas indexée et n&apos;apparaît dans aucun menu public.
      </p>
    </div>
  );
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

function OfficialCard({
  name,
  scope,
  usage,
  ingestion,
  pages,
}: {
  name: string;
  scope: string;
  usage: string;
  ingestion: string;
  pages: string;
}) {
  return (
    <div className="border border-emerald-200 bg-emerald-50/40 rounded p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold text-slate-900">{name}</span>
        <span className="text-[10px] text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded font-medium">
          ✓ visible UI
        </span>
      </div>
      <div className="text-[11px] text-slate-500 mt-0.5">{scope}</div>
      <div className="text-xs text-slate-700 mt-2 leading-snug">{usage}</div>
      <div className="text-[11px] text-slate-500 mt-2 leading-snug">
        <strong>Ingestion :</strong> {ingestion}
      </div>
      <div className="text-[11px] text-slate-500 mt-1 leading-snug">
        <strong>Pages :</strong> {pages}
      </div>
    </div>
  );
}

function ThirdPartyRow({
  name,
  data,
  mechanism,
  scrapers,
  schedule,
  csvs,
}: {
  name: string;
  data: string;
  mechanism: string;
  scrapers: string;
  schedule: string;
  csvs: string;
}) {
  return (
    <div className="border border-slate-200 rounded p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold text-slate-900">{name}</span>
        <span className="text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded font-medium">
          UI masqué
        </span>
      </div>
      <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1 text-[11px] mt-2">
        <dt className="text-slate-500">Données</dt>
        <dd className="text-slate-700">{data}</dd>
        <dt className="text-slate-500">Mécanisme</dt>
        <dd className="text-slate-700">{mechanism}</dd>
        <dt className="text-slate-500">Scrapers</dt>
        <dd className="text-slate-700 font-mono">{scrapers}</dd>
        <dt className="text-slate-500">Planning</dt>
        <dd className="text-slate-700">{schedule}</dd>
        <dt className="text-slate-500">CSV cibles</dt>
        <dd className="text-slate-700 font-mono">{csvs}</dd>
      </dl>
    </div>
  );
}

function Method({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-l-2 border-slate-300 pl-3">
      <h3 className="text-sm font-semibold text-slate-900 mb-1">{title}</h3>
      <div className="text-xs text-slate-600 space-y-1.5 leading-snug">{children}</div>
    </div>
  );
}
