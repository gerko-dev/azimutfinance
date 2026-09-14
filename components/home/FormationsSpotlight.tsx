import Link from "next/link";
import {
  CATEGORY_META,
  FORMAT_META,
  LEVEL_META,
  getCatalogStats,
  isRegistrationClosed,
  pricingLabel,
  totalDurationLabel,
  type Formation,
} from "@/lib/formations";

/**
 * Mise en avant des formations sur les pages d'accueil.
 *
 * POURQUOI DE VRAIES FICHES, ET PAS UN COMPTEUR. Les deux accueils se
 * contentaient d'annoncer « N formations, dont M gratuites » dans une vignette
 * coincee a cote du magazine. Un compteur ne donne envie a personne : il ne dit
 * ni de quoi ca parle, ni combien de temps ca prend, ni ce que ca coute. On
 * montre donc les formations elles-memes — titre, sujet, niveau, duree, prix —
 * et l'on garde le compteur comme simple pied de section.
 *
 * ORDRE D'AFFICHAGE. Une session qui ouvre bientot passe devant tout le reste :
 * c'est la seule information perissable du catalogue, et la manquer coute une
 * inscription. Viennent ensuite les formations mises en avant a la main, puis
 * l'ordre du catalogue. A defaut de ce tri, une session pleine ou passee
 * resterait en tete parce qu'elle est « featured ».
 *
 * Composant serveur : aucune interactivite, et les deux accueils chargent deja
 * le catalogue pour leurs statistiques.
 */

type Variante = "invite" | "membre";

/** Nombre de fiches affichees. Trois tiennent sur une ligne en grand ecran. */
const NB_FICHES = 3;

function dateSession(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Une session a venir, inscriptions encore ouvertes. */
function sessionImminente(f: Formation, maintenant: Date): boolean {
  if (!f.startsAt) return false;
  const debut = new Date(f.startsAt);
  if (Number.isNaN(debut.getTime()) || debut < maintenant) return false;
  return !isRegistrationClosed(f, maintenant);
}

function choisir(formations: Formation[]): Formation[] {
  const maintenant = new Date();
  const rang = (f: Formation) => {
    if (sessionImminente(f, maintenant)) return 0;
    if (f.featured) return 1;
    return 2;
  };
  // Tri STABLE : a rang egal, l'ordre du catalogue est conserve — il vient
  // deja de la base, mis en avant puis plus recemment modifie.
  return [...formations]
    .map((f, i) => ({ f, i }))
    .sort((a, b) => rang(a.f) - rang(b.f) || a.i - b.i)
    .slice(0, NB_FICHES)
    .map((x) => x.f);
}

function FicheFormation({ formation }: { formation: Formation }) {
  const categorie = CATEGORY_META[formation.category];
  const niveau = LEVEL_META[formation.level];
  const accent = formation.accentColor || categorie.color;
  const debut = dateSession(formation.startsAt);
  const maintenant = new Date();
  const imminente = sessionImminente(formation, maintenant);
  const gratuite = formation.pricing.type === "gratuit";

  return (
    <Link
      href={`/academie/formations/${formation.slug}`}
      className="group flex flex-col bg-white rounded-xl border border-slate-200 hover:border-slate-300 hover:shadow-lg transition overflow-hidden"
    >
      <div className="h-1.5 shrink-0" style={{ backgroundColor: accent }} />
      <div className="p-5 flex-1 flex flex-col">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className="text-[10px] uppercase tracking-wide font-semibold"
            style={{ color: accent }}
          >
            {categorie.label}
          </span>
          {imminente && (
            <span className="text-[9px] uppercase tracking-wide font-bold text-white bg-rose-600 px-1.5 py-0.5 rounded">
              Session à venir
            </span>
          )}
        </div>

        <h3 className="text-base md:text-lg font-bold text-slate-900 mt-2 leading-snug group-hover:text-blue-700 transition">
          {formation.title}
        </h3>
        <p className="text-xs md:text-sm text-slate-600 mt-2 leading-relaxed line-clamp-3 flex-1">
          {formation.shortDescription}
        </p>

        <div className="flex flex-wrap items-center gap-1.5 mt-3.5">
          <span
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded border"
            style={{
              color: niveau.color,
              borderColor: `${niveau.color}40`,
              backgroundColor: `${niveau.color}0f`,
            }}
          >
            {niveau.label}
          </span>
          <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
            {FORMAT_META[formation.format].label}
          </span>
          {formation.modules.length > 0 && (
            <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
              {totalDurationLabel(formation)} · {formation.modules.length} module
              {formation.modules.length > 1 ? "s" : ""}
            </span>
          )}
        </div>

        <div className="flex items-baseline justify-between gap-2 mt-3.5 pt-3 border-t border-slate-100">
          <span
            className={`text-sm font-bold ${
              gratuite ? "text-emerald-700" : "text-slate-900"
            }`}
          >
            {pricingLabel(formation)}
          </span>
          {debut && (
            <span className="text-[11px] text-slate-500 text-right">
              dès le {debut}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

export default function FormationsSpotlight({
  formations,
  variante,
}: {
  formations: Formation[];
  variante: Variante;
}) {
  // Rien a mettre en avant : on n'affiche pas une section vide plutot que de
  // promettre un catalogue inexistant.
  if (formations.length === 0) return null;

  const fiches = choisir(formations);
  const stats = getCatalogStats(formations);
  const invite = variante === "invite";

  const compteur = [
    `${stats.total} formation${stats.total > 1 ? "s" : ""}`,
    stats.freeCount > 0
      ? `${stats.freeCount} gratuite${stats.freeCount > 1 ? "s" : ""}`
      : null,
    stats.certifyingCount > 0
      ? `${stats.certifyingCount} certifiante${stats.certifyingCount > 1 ? "s" : ""}`
      : null,
    stats.totalHours > 0 ? `${stats.totalHours} h de contenu` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-3xl">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-purple-700">
            Se former
          </div>
          <h2
            className={`font-bold text-slate-900 leading-tight ${
              invite ? "text-2xl md:text-4xl mt-2" : "text-xl md:text-2xl mt-1"
            }`}
            style={{ letterSpacing: invite ? "-0.02em" : "-0.01em" }}
          >
            {invite
              ? "Nos formations sur les marchés UEMOA"
              : "Montez en compétence"}
          </h2>
          {/* Pas de chapo pour un membre : toutes les sections du tableau de
              bord s'en tiennent au titre, et en ajouter un ici casserait le
              rythme de lecture d'une page qu'on parcourt vite. */}
          {invite && (
            <p className="text-sm md:text-base text-slate-600 mt-3 leading-relaxed">
              Comprendre la BRVM, lire un bilan, valoriser une obligation
              souveraine, construire une allocation. Des parcours conçus pour le
              marché de la zone franc, pas traduits d&apos;ailleurs.
            </p>
          )}
        </div>
        <Link
          href="/academie/formations"
          className="shrink-0 inline-flex items-center gap-2 text-sm font-semibold text-purple-700 hover:underline"
        >
          Tout le catalogue →
        </Link>
      </div>

      <div
        className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5 ${
          invite ? "mt-10 md:mt-12" : "mt-5"
        }`}
      >
        {fiches.map((f) => (
          <FicheFormation key={f.slug} formation={f} />
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-xs text-slate-500">{compteur}</span>
        {invite && (
          <Link
            href="/academie/formations"
            className="inline-flex items-center px-4 py-2 rounded-md text-sm font-semibold bg-purple-700 hover:bg-purple-800 text-white transition"
          >
            Voir toutes les formations
          </Link>
        )}
      </div>
    </div>
  );
}
