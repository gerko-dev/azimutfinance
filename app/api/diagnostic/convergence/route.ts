/**
 * ROUTE TEMPORAIRE DE DIAGNOSTIC — A SUPPRIMER APRES USAGE.
 *
 * Le plan d'operations lit le portefeuille via Supabase avec le client a
 * cookies : il ne s'execute donc que dans une requete Next authentifiee, et
 * reste hors de portee d'un script local. Cette route s'execute dans TA
 * session de navigateur — ce sont tes cookies qui authentifient, aucune cle de
 * service n'est employee — et depose le bilan de convergence dans un fichier
 * JSON a la racine du depot, lisible hors ligne.
 *
 * Bridee au mode developpement : en production elle repond 404, comme si elle
 * n'existait pas.
 *
 * GET /api/diagnostic/convergence?fund=<uuid>[&tresorerie=<nombre>]
 *
 * Le segment ne peut PAS s'appeler `_debug` : un dossier prefixe d'un
 * underscore est un dossier prive au sens App Router, exclu du routage avec
 * tous ses enfants. La route repondait 404 sans jamais s'executer.
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

import { construirePlanOperations } from "@/app/gestion-portefeuille/operations-data";
import { loadCustomSecurities, loadFundPortfolios } from "@/app/gestion-portefeuille/portfolio-data";
import { etablissementDuCompte, indexerParNom } from "@/app/gestion-portefeuille/tresorerie-comptes";
import { normName } from "@/app/gestion-portefeuille/portfolio-match";

export const dynamic = "force-dynamic";

const FICHIER = "convergence-debug.json";

export async function GET(req: Request) {
  // On bloque la PRODUCTION plutot que d'exiger un NODE_ENV exact : le build
  // local n'est pas toujours etiquete "development", et une route de
  // diagnostic muette est plus difficile a diagnostiquer qu'autre chose.
  if (process.env.NODE_ENV === "production") {
    return new NextResponse(null, { status: 404 });
  }

  const url = new URL(req.url);
  const fundId = url.searchParams.get("fund");
  if (!fundId) {
    return NextResponse.json(
      { erreur: "Paramètre `fund` manquant : ?fund=<uuid du fonds>" },
      { status: 400 },
    );
  }
  const tresorerie = Number(url.searchParams.get("tresorerie") ?? 0) || 0;

  try {
    // ── Diagnostic tresorerie : d'ou viennent les comptes non rattaches ? ────
    const snapshots = await loadFundPortfolios(fundId);
    const toutesFiches = await loadCustomSecurities();
    const fiches = new Map(toutesFiches.map((c) => [c.id, c]));
    const parNom = indexerParNom(toutesFiches);
    // Fiches de tresorerie du referentiel, avec les clefs qu'elles exposent.
    // Toutes les fiches, avec les clefs qu'elles exposent au rapprochement.
    const referentiel = toutesFiches.map((c) => ({
      code: c.code,
      nom: c.name,
      kind: c.kind,
      cleNom: normName(c.name),
      cleCode: normName(c.code),
      alias: c.attributes?.alias ?? null,
    }));
    // Lignes de l'arrete de fin non rattachees, toutes sections confondues.
    const finSnap = snapshots.find((s) => s.slot === "fin");
    const nonRattacheesToutesSections = (finSnap?.positions ?? [])
      .filter((p) => !p.customSecurityId)
      .map((p) => {
        const libelle = (p.rawLabel || p.matchLabel || p.rawCode || "").trim();
        return {
          section: p.section,
          libelle,
          rawCode: p.rawCode,
          matchKind: p.matchKind,
          cleLibelle: normName(libelle),
          cleRawCode: normName(p.rawCode ?? ""),
          resoluParNom: parNom.get(normName(libelle))?.name ?? null,
        };
      });

    const ficheTresorerie = toutesFiches
      .filter((c) => c.kind === "tresorerie" || c.attributes?.banque)
      .map((c) => ({
        code: c.code,
        nom: c.name,
        cleNom: normName(c.name),
        cleCode: normName(c.code),
        banque: c.attributes?.banque ?? null,
        canal: c.attributes?.canal ?? null,
        typeCompte: c.attributes?.typeCompte ?? null,
      }));
    const inventaires = snapshots.map((s) => ({
      slot: s.slot,
      asOfDate: s.asOfDate,
      lignesTresorerie: s.positions
        .filter((p) => p.section === "tresorerie")
        .map((p) => {
          const fiche = p.customSecurityId ? fiches.get(p.customSecurityId) : undefined;
          const etab = etablissementDuCompte(fiche);
          const libelle = (p.rawLabel || p.matchLabel || p.rawCode || "").trim();
          const parNomLabel = parNom.get(normName(libelle));
          const parNomCode = parNom.get(normName(p.rawCode ?? ""));
          return {
            libelle,
            rawCode: p.rawCode,
            cleLibelle: normName(libelle),
            cleRawCode: normName(p.rawCode ?? ""),
            resoluParNom: parNomLabel?.name ?? parNomCode?.name ?? null,
            valorisation: p.valuation,
            lieAuReferentiel: Boolean(p.customSecurityId),
            ficheTrouvee: Boolean(fiche),
            attributs: fiche?.attributes ?? null,
            etablissement: etab?.cle ?? null,
            motifNonRattache: !p.customSecurityId
              ? "position non liée à une fiche du référentiel"
              : !fiche
                ? "fiche introuvable (customSecurityId orphelin)"
                : !etab
                  ? "fiche sans champ « banque » renseigné"
                  : null,
          };
        }),
    }));

    const plan = await construirePlanOperations(fundId, tresorerie);

    // On ne retient que ce qui sert au diagnostic : pas de donnee nominative,
    // pas de position ligne a ligne.
    const rapport = {
      genere: new Date().toISOString(),
      fundId,
      tresorerie,
      dateInventaire: plan.dateInventaire,
      avertissements: plan.avertissements,
      arbitrage: {
        produitCessions: plan.produitCessions,
        montantSouscrit: plan.montantSouscrit,
        decoteCessionMoyenne: plan.decoteCessionMoyenne,
        decoteAchatMoyenne: plan.decoteAchatMoyenne,
        arbitrageValide: plan.arbitrageValide,
      },
      volumes: {
        achatsActions: plan.achatsActions.length,
        ventesActions: plan.ventesActions.length,
        cessionsObligations: plan.cessionsObligations.length,
        souscriptions: plan.souscriptions.length,
        pairesSansContrepartie: plan.pairesObligations.filter((p) => !p.souscription).length,
      },
      inventaires,
      ficheTresorerie,
      referentiel,
      nonRattacheesToutesSections,
      rendementNaturel: plan.rendementNaturel,
      convergence: plan.convergence,
      impactsParPaire: plan.pairesObligations
        .filter((p) => p.souscription)
        .map((p) => ({
          cede: p.cession.libelle,
          rendementCede: p.cession.rendement,
          versEtat: p.souscription?.etat,
          rendementAchete: p.souscription?.rendementAttendu,
          montant: p.souscription?.montant,
          margeDecote: p.margeDecote,
          impactNetBp: p.impactNetBp,
        })),
      // Les souscriptions en clair : c'est la ou se lisent le plafonnement au
      // besoin et le routage du reliquat.
      souscriptions: plan.souscriptions.map((s) => ({
        etat: s.etat,
        maturiteMois: s.maturiteMois,
        residuelMois: Number(s.residuelMois.toFixed(1)),
        prixMarginalObserve: s.prixMarginalObserve,
        sourcePrixReference: s.sourcePrixReference,
        ageObservation: s.ageObservation,
        prixPropose: s.prixPropose,
        decoteAchat: s.decoteAchat,
        rendementAttendu: s.rendementAttendu,
        montantDisponible: s.montantDisponible,
        quantite: s.quantite,
        montant: s.montant,
        impactRendementBp: s.impactRendementBp,
        reserve: s.reserve,
      })),
      cessions: plan.cessionsObligations.map((c) => ({
        code: c.code,
        poste: c.poste,
        rendement: c.rendement,
        maturiteResiduelle: c.maturiteResiduelle,
        prixCession: c.prixCession,
        sourcePrix: c.sourcePrix,
        decoteCession: c.decoteCession,
        quantite: c.quantite,
        produitNet: c.produitNet,
        impactRendementBp: c.impactRendementBp,
        reserve: c.reserve,
      })),
      motifsSansContrepartie: plan.pairesObligations
        .filter((p) => !p.souscription)
        .map((p) => ({
          cession: p.cession.libelle,
          produitNet: p.cession.produitNet,
          decoteCession: p.cession.decoteCession,
          motif: p.motifSansContrepartie,
        })),
    };

    const chemin = path.join(process.cwd(), FICHIER);
    await writeFile(chemin, JSON.stringify(rapport, null, 2), "utf-8");

    return NextResponse.json({
      ok: true,
      ecritDans: chemin,
      resume: {
        dateInventaire: rapport.dateInventaire,
        postes: plan.convergence.postes.length,
        postesNonResolus: plan.convergence.postesNonResolus,
        tauxCouverture: plan.convergence.tauxCouverture,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, erreur: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
