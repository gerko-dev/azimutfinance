// Rapport PDF "Marche des actions BRVM" pour publication reseaux sociaux.
// Format A4 portrait multi-pages, charte AzimutFinance.
//
// Genere via @react-pdf/renderer cote serveur (renderToBuffer). N'EST PAS
// importable depuis un composant client (utilise fs pour lire les logos).

import React from "react";
import { readFileSync } from "fs";
import { join } from "path";
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";
import type { ActionRow } from "../dataLoader";
import type { BrvmLiveIndex } from "../brvm/liveIndices";

// === COULEURS CHARTE AZIMUTFINANCE ===
const C = {
  marine: "#0A2A5E",
  ciel: "#3DA4E0",
  ardoise: "#5B6B82",
  fondClair: "#F4F7FB",
  white: "#FFFFFF",
  ok: "#0F6E56",
  ko: "#B91C1C",
  border: "#E2E8F0",
};

// Note: on s'appuie sur les fonts par defaut de react-pdf (Helvetica) au lieu
// de Poppins. Ajout de Poppins possible plus tard en bundlant les .ttf dans
// lib/reports/fonts/ (a charger via fs + Font.register avec src: Buffer).

// === LOGOS EN BASE64 ===
function logoDataUri(file: string): string {
  const buf = readFileSync(join(process.cwd(), "logo", "png", file));
  return `data:image/png;base64,${buf.toString("base64")}`;
}

// === STYLES ===
const styles = StyleSheet.create({
  page: {
    fontSize: 10,
    color: C.marine,
    paddingTop: 30,
    paddingBottom: 50,
    paddingHorizontal: 35,
  },
  // ── PAGE DE GARDE ─────────────────────────────────────────────────────
  coverPage: {
    backgroundColor: C.marine,
    color: C.white,
    padding: 0,
  },
  coverInner: {
    flex: 1,
    flexDirection: "column",
    justifyContent: "space-between",
    paddingTop: 80,
    paddingBottom: 60,
    paddingHorizontal: 50,
  },
  coverTop: {
    alignItems: "center",
  },
  coverLogo: {
    width: 320,
    marginBottom: 80,
  },
  coverEyebrow: {
    fontSize: 11,
    letterSpacing: 4,
    color: C.ciel,
    marginBottom: 15,
    textTransform: "uppercase",
    fontWeight: 500,
  },
  coverTitle: {
    fontSize: 36,
    fontWeight: 700,
    textAlign: "center",
    lineHeight: 1.2,
    marginBottom: 20,
  },
  coverSubtitle: {
    fontSize: 14,
    color: C.ciel,
    textAlign: "center",
    fontWeight: 500,
  },
  coverFooter: {
    alignItems: "center",
  },
  coverUrl: {
    fontSize: 13,
    color: C.white,
    letterSpacing: 1,
    fontWeight: 600,
    marginBottom: 5,
  },
  coverTagline: {
    fontSize: 9,
    color: C.ciel,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  // ── PAGES INTERIEURES ─────────────────────────────────────────────────
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 12,
    marginBottom: 20,
    borderBottomWidth: 2,
    borderBottomColor: C.marine,
  },
  headerLogo: {
    width: 110,
  },
  headerDate: {
    fontSize: 9,
    color: C.ardoise,
    letterSpacing: 1,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 700,
    color: C.marine,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 10,
    color: C.ardoise,
    marginBottom: 18,
  },
  // ── CARDS INDICES ─────────────────────────────────────────────────────
  indexGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 18,
  },
  indexCard: {
    width: "48%",
    backgroundColor: C.fondClair,
    borderLeftWidth: 3,
    borderLeftColor: C.ciel,
    padding: 12,
    borderRadius: 4,
  },
  indexCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  indexCardName: {
    fontSize: 11,
    fontWeight: 600,
    color: C.marine,
  },
  indexCardCategory: {
    fontSize: 7,
    color: C.ardoise,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  indexCardValue: {
    fontSize: 22,
    fontWeight: 700,
    color: C.marine,
    marginBottom: 3,
  },
  indexCardChange: {
    fontSize: 11,
    fontWeight: 600,
  },
  indexCardYtd: {
    fontSize: 8,
    color: C.ardoise,
    marginTop: 3,
  },
  // ── TABLEAUX TOP MOVERS ───────────────────────────────────────────────
  tableHeader: {
    flexDirection: "row",
    backgroundColor: C.marine,
    color: C.white,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginBottom: 2,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: C.border,
  },
  tableRowAlt: {
    backgroundColor: C.fondClair,
  },
  cellCode: { width: "15%", fontWeight: 600, fontSize: 9 },
  cellName: { width: "50%", fontSize: 9, color: C.ardoise },
  cellPrice: { width: "20%", textAlign: "right", fontSize: 9, fontWeight: 500 },
  cellChange: { width: "15%", textAlign: "right", fontSize: 9, fontWeight: 700 },
  cellHeaderText: { color: C.white, fontSize: 8, letterSpacing: 1, textTransform: "uppercase" },
  movers2col: {
    flexDirection: "row",
    gap: 14,
    marginBottom: 18,
  },
  moversCol: {
    flex: 1,
  },
  moversTitle: {
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 8,
  },
  // ── STATS ─────────────────────────────────────────────────────────────
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 18,
  },
  statCard: {
    width: "23.5%",
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
    padding: 10,
    borderRadius: 4,
  },
  statLabel: {
    fontSize: 7,
    color: C.ardoise,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: 700,
    color: C.marine,
  },
  statSub: {
    fontSize: 7,
    color: C.ardoise,
    marginTop: 2,
  },
  // ── HEATMAP SECTEURS ──────────────────────────────────────────────────
  sectorRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  sectorLabel: {
    width: "30%",
    fontSize: 9,
    fontWeight: 500,
  },
  sectorBarTrack: {
    flex: 1,
    height: 18,
    backgroundColor: C.fondClair,
    borderRadius: 2,
    position: "relative",
    overflow: "hidden",
  },
  sectorBarFill: {
    height: "100%",
    backgroundColor: C.ciel,
  },
  sectorBarText: {
    position: "absolute",
    right: 6,
    top: 4,
    fontSize: 8,
    color: C.marine,
    fontWeight: 600,
  },
  // ── FOOTER ────────────────────────────────────────────────────────────
  footer: {
    position: "absolute",
    bottom: 25,
    left: 35,
    right: 35,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: C.border,
    fontSize: 7,
    color: C.ardoise,
  },
  // ── DERNIERE PAGE ─────────────────────────────────────────────────────
  cta: {
    backgroundColor: C.fondClair,
    borderLeftWidth: 4,
    borderLeftColor: C.ciel,
    padding: 18,
    marginTop: 12,
  },
  ctaTitle: {
    fontSize: 14,
    fontWeight: 700,
    marginBottom: 6,
  },
  ctaText: {
    fontSize: 10,
    color: C.ardoise,
    lineHeight: 1.5,
    marginBottom: 8,
  },
  ctaUrl: {
    fontSize: 12,
    color: C.ciel,
    fontWeight: 600,
  },
  legalText: {
    position: "absolute",
    bottom: 35,
    left: 35,
    right: 35,
    fontSize: 7,
    color: C.ardoise,
    lineHeight: 1.4,
    textAlign: "center",
  },
});

// === HELPERS ===
function fmtFCFA(v: number): string {
  return Math.round(v).toLocaleString("fr-FR").replace(/,/g, " ");
}
function fmtBigFCFA(v: number): string {
  if (v >= 1e12) return (v / 1e12).toFixed(2).replace(".", ",") + " T";
  if (v >= 1e9) return (v / 1e9).toFixed(1).replace(".", ",") + " Mds";
  if (v >= 1e6) return (v / 1e6).toFixed(0) + " M";
  return fmtFCFA(v);
}
function fmtPct(v: number, sign = true): string {
  const s = sign && v > 0 ? "+" : "";
  return `${s}${v.toFixed(2).replace(".", ",")} %`;
}
function pctColor(v: number): string {
  if (v > 0.05) return C.ok;
  if (v < -0.05) return C.ko;
  return C.ardoise;
}
function fmtFullDate(d: Date): string {
  return d.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// === DONNEES D'ENTREE ===
export type ActionsReportData = {
  generatedAt: Date;
  actions: ActionRow[];
  indices: BrvmLiveIndex[];
  sessionLabel: string | null;
  marketStats: {
    totalActions: number;
    totalCapitalization: number;
    totalVolume: number;
    averagePer: number;
    averageYield: number;
    bySector: Record<string, number>;
  };
};

// === DOCUMENT ===
export function ActionsMarketReport({ data }: { data: ActionsReportData }) {
  const dateStr = fmtFullDate(data.generatedAt);
  const logoBlanc = logoDataUri("logo-horizontal-fond-sombre.png");
  const logoMarine = logoDataUri("logo-horizontal.png");

  // Top movers (live only, par variation %)
  const liveOnly = data.actions.filter((a) => a.price > 0);
  const gainers = [...liveOnly]
    .filter((a) => a.changePercent > 0)
    .sort((a, b) => b.changePercent - a.changePercent)
    .slice(0, 8);
  const losers = [...liveOnly]
    .filter((a) => a.changePercent < 0)
    .sort((a, b) => a.changePercent - b.changePercent)
    .slice(0, 8);

  // Top capi
  const topCapi = [...liveOnly]
    .filter((a) => a.capitalization > 0)
    .sort((a, b) => b.capitalization - a.capitalization)
    .slice(0, 10);

  // Indices principaux à mettre en avant
  const principalCodes = ["BRVMC", "BRVM30", "BRVMPA", "BRVMPR"];
  const principalIndices = principalCodes
    .map((c) => data.indices.find((i) => i.code === c))
    .filter((i): i is BrvmLiveIndex => !!i);

  // Repartition sectorielle (capi)
  const sectorPairs = Object.entries(data.marketStats.bySector)
    .map(([sector, capi]) => ({ sector, capi }))
    .sort((a, b) => b.capi - a.capi);
  const maxSectorCapi = Math.max(...sectorPairs.map((s) => s.capi), 1);

  return (
    <Document
      title={`AzimutFinance — Marche des actions BRVM — ${dateStr}`}
      author="AzimutFinance"
      subject="Synthese du marche des actions BRVM"
      keywords="BRVM, actions, UEMOA, marche, AzimutFinance"
    >
      {/* ─────────── PAGE 1 — COVER ─────────── */}
      <Page size="A4" style={styles.coverPage}>
        <View style={styles.coverInner}>
          <View style={styles.coverTop}>
            <Image src={logoBlanc} style={styles.coverLogo} />
            <Text style={styles.coverEyebrow}>Synthèse hebdomadaire</Text>
            <Text style={styles.coverTitle}>
              Marché des actions{"\n"}BRVM
            </Text>
            <Text style={styles.coverSubtitle}>{dateStr}</Text>
          </View>
          <View style={styles.coverFooter}>
            <Text style={styles.coverUrl}>azimutfinance.com</Text>
            <Text style={styles.coverTagline}>
              Orienter l&apos;épargne ouest-africaine
            </Text>
          </View>
        </View>
      </Page>

      {/* ─────────── PAGE 2 — INDICES ─────────── */}
      <Page size="A4" style={styles.page}>
        <PageHeader logo={logoMarine} dateStr={dateStr} />
        <Text style={styles.sectionTitle}>Indices BRVM</Text>
        <Text style={styles.sectionSubtitle}>
          Variation jour et performance depuis le 1ᵉʳ janvier ·{" "}
          {data.sessionLabel ?? "Dernière séance disponible"}
        </Text>
        <View style={styles.indexGrid}>
          {principalIndices.map((idx) => (
            <View key={idx.code} style={styles.indexCard}>
              <View style={styles.indexCardHeader}>
                <Text style={styles.indexCardName}>{idx.code}</Text>
                <Text style={styles.indexCardCategory}>{idx.category}</Text>
              </View>
              <Text style={styles.indexCardValue}>
                {idx.value.toLocaleString("fr-FR", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                }).replace(/,/g, " ")}
              </Text>
              <Text
                style={[
                  styles.indexCardChange,
                  { color: pctColor(idx.variationPct / 100) },
                ]}
              >
                {fmtPct(idx.variationPct)} jour
              </Text>
              <Text style={styles.indexCardYtd}>
                YTD : {fmtPct(idx.ytdPct)}
              </Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Statistiques marché</Text>
        <Text style={styles.sectionSubtitle}>
          Vue d&apos;ensemble des {data.marketStats.totalActions} valeurs cotées
        </Text>
        <View style={styles.statsGrid}>
          <StatBox
            label="Capi totale"
            value={fmtBigFCFA(data.marketStats.totalCapitalization) + " FCFA"}
            sub="48 valeurs"
          />
          <StatBox
            label="Volume jour"
            value={fmtBigFCFA(data.marketStats.totalVolume)}
            sub="titres échangés"
          />
          <StatBox
            label="PER moyen"
            value={data.marketStats.averagePer.toFixed(1).replace(".", ",") + "×"}
            sub="hors pertes"
          />
          <StatBox
            label="Yield moyen"
            value={data.marketStats.averageYield.toFixed(2).replace(".", ",") + " %"}
            sub="DPA / cours"
          />
        </View>
        <PageFooter pageNumber={2} />
      </Page>

      {/* ─────────── PAGE 3 — TOP MOVERS ─────────── */}
      <Page size="A4" style={styles.page}>
        <PageHeader logo={logoMarine} dateStr={dateStr} />
        <Text style={styles.sectionTitle}>Hausses & baisses du jour</Text>
        <Text style={styles.sectionSubtitle}>
          Variations sur la séance · top 8 par variation %
        </Text>
        <View style={styles.movers2col}>
          <View style={styles.moversCol}>
            <Text style={[styles.moversTitle, { color: C.ok }]}>
              ▲ Hausses
            </Text>
            <MoverTable rows={gainers} colorPositive />
          </View>
          <View style={styles.moversCol}>
            <Text style={[styles.moversTitle, { color: C.ko }]}>
              ▼ Baisses
            </Text>
            <MoverTable rows={losers} colorPositive={false} />
          </View>
        </View>
        <PageFooter pageNumber={3} />
      </Page>

      {/* ─────────── PAGE 4 — TOP CAPI + SECTEURS ─────────── */}
      <Page size="A4" style={styles.page}>
        <PageHeader logo={logoMarine} dateStr={dateStr} />
        <Text style={styles.sectionTitle}>Top 10 capitalisations</Text>
        <Text style={styles.sectionSubtitle}>
          Les poids lourds de la cote BRVM
        </Text>
        <View>
          <View style={styles.tableHeader}>
            <Text style={[styles.cellCode, styles.cellHeaderText]}>Ticker</Text>
            <Text style={[styles.cellName, styles.cellHeaderText]}>Société</Text>
            <Text style={[styles.cellPrice, styles.cellHeaderText]}>Capi</Text>
            <Text style={[styles.cellChange, styles.cellHeaderText]}>Var %</Text>
          </View>
          {topCapi.map((a, i) => (
            <View
              key={a.code}
              style={[styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}]}
            >
              <Text style={styles.cellCode}>{a.code}</Text>
              <Text style={styles.cellName}>{a.name}</Text>
              <Text style={styles.cellPrice}>{fmtBigFCFA(a.capitalization)}</Text>
              <Text
                style={[
                  styles.cellChange,
                  { color: pctColor(a.changePercent / 100) },
                ]}
              >
                {fmtPct(a.changePercent)}
              </Text>
            </View>
          ))}
        </View>

        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>
          Répartition sectorielle
        </Text>
        <Text style={styles.sectionSubtitle}>
          Poids de chaque secteur dans la capitalisation totale
        </Text>
        <View>
          {sectorPairs.map((s) => {
            const pct = s.capi / data.marketStats.totalCapitalization;
            const width = (s.capi / maxSectorCapi) * 100;
            return (
              <View key={s.sector} style={styles.sectorRow}>
                <Text style={styles.sectorLabel}>{s.sector}</Text>
                <View style={styles.sectorBarTrack}>
                  <View style={[styles.sectorBarFill, { width: `${width}%` }]} />
                  <Text style={styles.sectorBarText}>
                    {(pct * 100).toFixed(1).replace(".", ",")} %
                  </Text>
                </View>
              </View>
            );
          })}
        </View>

        <PageFooter pageNumber={4} />
      </Page>

      {/* ─────────── PAGE 5 — CTA + LEGAL ─────────── */}
      <Page size="A4" style={styles.page}>
        <PageHeader logo={logoMarine} dateStr={dateStr} />
        <View style={styles.cta}>
          <Text style={styles.ctaTitle}>
            Pour aller plus loin · azimutfinance.com
          </Text>
          <Text style={styles.ctaText}>
            Suivez en temps réel la BRVM, accédez aux états financiers de 48
            sociétés cotées sur 10 ans (SYSCOHADA + bancaires), simulez des
            obligations UMOA-Titres, calibrez votre portefeuille et recevez les
            alertes sur vos titres préférés.
          </Text>
          <Text style={styles.ctaUrl}>→ azimutfinance.com</Text>
        </View>

        <View style={[styles.cta, { marginTop: 20 }]}>
          <Text style={styles.ctaTitle}>Suivez-nous sur les réseaux</Text>
          <Text style={styles.ctaText}>
            LinkedIn · X · Facebook · YouTube — Veille marché quotidienne,
            analyses sectorielles, décryptages des publications financières.
          </Text>
        </View>

        <Text style={styles.legalText}>
          Document généré automatiquement par AzimutFinance le {dateStr}.{"\n"}
          Source des cours et indices : Bourse Régionale des Valeurs Mobilières
          (brvm.org) · Données fondamentales : états financiers SYSCOHADA
          publiés par les sociétés cotées.{"\n"}
          Aucune information de ce document ne constitue un conseil en
          investissement. Investir comporte un risque de perte en capital.
        </Text>
      </Page>
    </Document>
  );
}

// === SOUS-COMPOSANTS ===

function PageHeader({ logo, dateStr }: { logo: string; dateStr: string }) {
  return (
    <View style={styles.header} fixed>
      <Image src={logo} style={styles.headerLogo} />
      <Text style={styles.headerDate}>{dateStr.toUpperCase()}</Text>
    </View>
  );
}

function PageFooter({ pageNumber }: { pageNumber: number }) {
  return (
    <View style={styles.footer} fixed>
      <Text>azimutfinance.com · Marché des actions BRVM</Text>
      <Text>p. {pageNumber}</Text>
    </View>
  );
}

function StatBox({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      {sub && <Text style={styles.statSub}>{sub}</Text>}
    </View>
  );
}

function MoverTable({
  rows,
  colorPositive,
}: {
  rows: ActionRow[];
  colorPositive: boolean;
}) {
  if (rows.length === 0) {
    return (
      <Text style={{ fontSize: 9, color: C.ardoise, fontStyle: "italic" }}>
        Aucune valeur sur la séance.
      </Text>
    );
  }
  return (
    <View>
      {rows.map((a, i) => (
        <View
          key={a.code}
          style={[styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}]}
        >
          <Text style={[styles.cellCode, { width: "25%" }]}>{a.code}</Text>
          <Text style={[styles.cellName, { width: "45%", fontSize: 8 }]}>
            {a.name.length > 18 ? a.name.slice(0, 17) + "…" : a.name}
          </Text>
          <Text
            style={[
              styles.cellChange,
              {
                width: "30%",
                color: colorPositive ? C.ok : C.ko,
              },
            ]}
          >
            {fmtPct(a.changePercent)}
          </Text>
        </View>
      ))}
    </View>
  );
}
