import Header from "@/components/Header";
import GlossaireCatalog from "@/components/academie/GlossaireCatalog";
import { GLOSSAIRE, GLOSS_CATEGORY_META, getGlossaireStats } from "@/lib/glossaire";

export const metadata = {
  title: "Glossaire financier UEMOA — AzimutFinance",
  description:
    "Plus de 70 termes financiers contextualisés pour la zone UEMOA et la BRVM : actions, obligations, analyse, macro, gestion de portefeuille, réglementation et fiscalité. Recherche rapide, navigation alphabétique et termes liés.",
};

export const dynamic = "force-static";

export default async function Page() {
  const stats = getGlossaireStats();

  // Light shape pour le client
  const termsLight = GLOSSAIRE.map((t) => ({
    slug: t.slug,
    term: t.term,
    acronym: t.acronym,
    short: t.short,
    category: t.category,
    tags: t.tags,
  }));

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />

      {/* HERO */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
          <div className="text-xs text-slate-500 mb-2">
            Accueil &rsaquo; Académie &rsaquo; Glossaire financier
          </div>
          <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-semibold text-slate-900">
                Glossaire financier UEMOA
              </h1>
              <p className="text-xs md:text-sm text-slate-500 mt-1 max-w-3xl">
                {stats.total} termes financiers contextualisés pour la BRVM et la zone UEMOA :
                actions, obligations souveraines, analyse fondamentale, macro BCEAO, gestion de
                portefeuille, réglementation CREPMF et fiscalité. Définitions courtes pour
                consultation rapide, longues pour aller plus loin.
              </p>
            </div>
            <div className="text-right text-[11px] text-slate-500">
              <span className="font-medium text-slate-700">8 catégories</span> · {stats.uniqueLetters}{" "}
              lettres couvertes
            </div>
          </div>

          {/* Catégories en chiffres */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
            {(Object.keys(GLOSS_CATEGORY_META) as (keyof typeof GLOSS_CATEGORY_META)[]).map(
              (cat) => {
                const meta = GLOSS_CATEGORY_META[cat];
                const count = stats.byCategory[cat];
                return (
                  <div
                    key={cat}
                    className="border border-slate-200 rounded-lg p-2.5 bg-white flex items-center gap-2.5"
                  >
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ background: meta.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-slate-800 truncate">
                        {meta.label}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {count} terme{count > 1 ? "s" : ""}
                      </div>
                    </div>
                  </div>
                );
              },
            )}
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
        <GlossaireCatalog terms={termsLight} />

        {/* Aide */}
        <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
          <h3 className="text-sm font-semibold mb-2">Comment utiliser le glossaire</h3>
          <div className="text-xs text-slate-600 space-y-1.5">
            <p>
              <strong>Recherche :</strong> tapez un mot, un acronyme (ex : <em>YTM</em>,{" "}
              <em>EBITDA</em>, <em>SGI</em>) ou un thème (ex : <em>obligation</em>,{" "}
              <em>taux directeur</em>) ; la recherche couvre le terme, l&apos;acronyme, la
              définition courte et les mots-clés.
            </p>
            <p>
              <strong>Navigation alphabétique :</strong> cliquez sur une lettre pour filtrer ; les
              lettres sans terme sont désactivées.
            </p>
            <p>
              <strong>Filtre par catégorie :</strong> sélectionnez une ou plusieurs catégories pour
              cibler vos lectures (par exemple, tout le vocabulaire obligataire).
            </p>
            <p>
              <strong>Termes liés :</strong> chaque fiche détaillée renvoie vers les concepts
              associés pour une lecture en profondeur.
            </p>
            <p>
              <strong>Mise à jour :</strong> le glossaire est révisé en continu pour refléter les
              évolutions réglementaires (CREPMF, BCEAO) et les nouveaux instruments cotés.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
