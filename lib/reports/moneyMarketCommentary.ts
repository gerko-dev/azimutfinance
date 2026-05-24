import "server-only";

// === COMMENTAIRES HEBDOMADAIRES MARCHÉ DES TITRES PUBLICS (Claude + web search) ===
// Un seul appel à l'API Claude (Opus 4.7) avec recherche web serveur : on fournit
// l'activité d'adjudication de la semaine sur UMOA-Titres (par État), Claude
// recherche les faits marquants (politique BCEAO, liquidité bancaire, notations,
// programmes d'émission, contexte régional) et renvoie un JSON
// { global, commentaries{<code pays>:…} }.
// Sans ANTHROPIC_API_KEY → renvoie null → rapport produit sans commentaires.

import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-opus-4-7";

export type MMCommentaryInput = {
  /** Libellé de semaine, ex « du 16 au 22 mai 2026 » */
  weekLabel: string;
  /** Date d'arrêté des données (ISO YYYY-MM-DD) */
  asOf: string;
  /** Total UEMOA de la semaine (montant retenu, en milliards FCFA) */
  weekTotalAmountMds: number;
  weekTotalCount: number;
  countries: {
    code: string;
    name: string;
    /** Adjudications de la semaine */
    weekCount: number;
    /** Montant retenu de la semaine (Mds FCFA) */
    weekAmountMds: number;
    /** Rendement moyen pondéré de la semaine (%) — null si aucune adjudication */
    weekYieldPct: number | null;
    /** Rendement moyen pondéré 12 mois (%) */
    yield12mPct: number;
    rank: number;
    sharePct: number;
  }[];
};

export type MoneyMarketCommentary = {
  generatedAt: string;
  model: string;
  /** Synthèse globale du marché de la semaine (3-5 phrases) */
  global: string;
  /** Commentaire par code pays (CI, SN, …) */
  perCountry: Record<string, string>;
  sources: string[];
};

const SYSTEM = `Tu es analyste taux et dette souveraine senior pour AzimutFinance, portail financier de la BRVM / zone UEMOA (Afrique de l'Ouest francophone).
Ta mission : expliquer, faits à l'appui, l'activité d'émission de la semaine sur le Marché des Titres Publics (UMOA-Titres) — adjudications de Bons d'Assimilation du Trésor (BAT, court terme) et d'Obligations Assimilables du Trésor (OAT, moyen/long terme) des 8 États membres.
- Utilise systématiquement l'outil de recherche web pour identifier les catalyseurs concrets de la semaine : taux directeur et opérations de la BCEAO, liquidité du système bancaire, taux interbancaire, demande des investisseurs (taux de couverture), notations souveraines (Moody's, Fitch, S&P, Bloomfield, WARA), programmes d'émission annuels des Trésors, contexte budgétaire/FMI, et événements régionaux. Ne te fie pas à tes seules connaissances.
- Rédige en français, ton factuel et professionnel, sans jargon inutile, sans conseil d'investissement.
- Pour CHAQUE pays fourni : 2 à 4 phrases. Si le pays n'a pas émis cette semaine, situe-le dans la dynamique des 12 mois (niveau de taux, fréquence d'émission, signature) plutôt que d'inventer une adjudication. Cite les chiffres clés (montant levé, rendement pondéré, couverture) quand c'est pertinent.
- Le commentaire « global » (3 à 5 phrases) synthétise la tonalité d'ensemble de la semaine sur le marché régional : direction des taux, appétit des investisseurs, États les plus actifs, lien avec la politique monétaire de la BCEAO.
RÉPONDS STRICTEMENT par un unique objet JSON valide, sans aucun texte avant ou après, de la forme :
{"global":"…","commentaries":{"<code pays>":"…", …}}
Utilise exactement les codes pays fournis comme clés (ex. CI, SN, BJ, TG, BF, ML, NE, GW).`;

function fmtPct(v: number | null): string {
  if (v == null || !isFinite(v)) return "n.d.";
  return v.toFixed(2) + " %";
}

/** Extrait le premier objet JSON équilibré d'une chaîne (tolère le texte parasite). */
function extractJsonObject(text: string): string | null {
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const candidate = fence ? fence[1] : text;
  const start = candidate.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < candidate.length; i++) {
    const ch = candidate[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return candidate.slice(start, i + 1);
    }
  }
  return null;
}

/** Échappe les caractères de contrôle bruts dans les chaînes JSON (le modèle en insère parfois). */
function sanitizeJsonControlChars(s: string): string {
  let out = "";
  let inStr = false;
  let esc = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const code = s.charCodeAt(i);
    if (inStr) {
      if (esc) {
        out += ch;
        esc = false;
      } else if (ch === "\\") {
        out += ch;
        esc = true;
      } else if (ch === '"') {
        out += ch;
        inStr = false;
      } else if (code < 0x20) {
        out +=
          ch === "\n" ? "\\n" : ch === "\r" ? "\\r" : ch === "\t" ? "\\t" : "\\u" + code.toString(16).padStart(4, "0");
      } else {
        out += ch;
      }
    } else {
      if (ch === '"') inStr = true;
      out += ch;
    }
  }
  return out;
}

/** Rassemble les URLs des résultats de recherche web (best-effort, défensif). */
function collectSources(content: Anthropic.ContentBlock[]): string[] {
  const urls = new Set<string>();
  for (const block of content) {
    const b = block as unknown as {
      type: string;
      content?: Array<{ type?: string; url?: string }>;
      citations?: Array<{ url?: string }>;
    };
    if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
      for (const r of b.content) if (r?.url) urls.add(r.url);
    }
    if (Array.isArray(b.citations)) {
      for (const c of b.citations) if (c?.url) urls.add(c.url);
    }
  }
  return Array.from(urls).slice(0, 20);
}

export async function generateMoneyMarketCommentary(
  input: MMCommentaryInput,
): Promise<MoneyMarketCommentary | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const client = new Anthropic({ apiKey, maxRetries: 1 });

  const dataLines = input.countries
    .map(
      (c) =>
        `- ${c.code} — ${c.name} : ${c.weekCount} adjudication(s) cette semaine, ${c.weekAmountMds.toFixed(
          1,
        )} Mds FCFA retenus, rendement pondéré semaine ${fmtPct(
          c.weekYieldPct,
        )} ; rendement pondéré 12 mois ${fmtPct(c.yield12mPct)} ; ${c.rank}e émetteur UEMOA sur 12 mois (part ${c.sharePct.toFixed(
          1,
        )} %)`,
    )
    .join("\n");

  const userText = `Semaine ${input.weekLabel} — données d'adjudication UMOA-Titres arrêtées au ${input.asOf}.
Activité régionale de la semaine : ${input.weekTotalCount} adjudication(s), ${input.weekTotalAmountMds.toFixed(
    1,
  )} Mds FCFA retenus au total sur l'UEMOA.
Détail par État :
${dataLines}

Pour CHAQUE État ci-dessus, recherche sur le web les faits marquants de la semaine (politique BCEAO, liquidité, demande, notations, programmes du Trésor, contexte budgétaire) qui éclairent son activité et le niveau de ses taux, puis rédige le commentaire. Termine par le commentaire « global ».
Réponds uniquement par le JSON demandé.`;

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userText }];

  // Budget temps global : la route a maxDuration=300 → on borne bien en deçà.
  const DEADLINE_MS = 260_000;
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), DEADLINE_MS);

  let final: Anthropic.Message | undefined;
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const stream = client.messages.stream(
        {
          model: MODEL,
          max_tokens: 6000,
          thinking: { type: "adaptive" },
          output_config: { effort: "medium" },
          system: [
            { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
          ],
          tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 8 }],
          messages,
        },
        { signal: controller.signal, timeout: DEADLINE_MS },
      );
      final = await stream.finalMessage();
      if (final.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: final.content });
        continue;
      }
      break;
    }
  } catch (e) {
    console.error("[moneyMarketCommentary] appel API échoué/expiré", e);
    return null;
  } finally {
    clearTimeout(deadline);
  }

  if (!final) return null;

  const text = final.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  const jsonStr = extractJsonObject(text);
  if (!jsonStr) {
    console.error("[moneyMarketCommentary] JSON introuvable dans la réponse.");
    return null;
  }

  let parsed: { global?: string; commentaries?: Record<string, string> };
  try {
    parsed = JSON.parse(sanitizeJsonControlChars(jsonStr));
  } catch (e) {
    console.error("[moneyMarketCommentary] JSON.parse échoué", e);
    return null;
  }

  return {
    generatedAt: new Date().toISOString(),
    model: MODEL,
    global: (parsed.global ?? "").trim(),
    perCountry: parsed.commentaries ?? {},
    sources: collectSources(final.content),
  };
}
