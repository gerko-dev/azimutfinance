import "server-only";

// === COMMENTAIRES HEBDOMADAIRES MATIÈRES PREMIÈRES (Claude + web search) ===
// Un seul appel à l'API Claude (Opus 4.7) avec l'outil de recherche web
// serveur : on fournit les variations hebdo des MP, Claude recherche les faits
// marquants de la semaine et renvoie un JSON { global, commentaries{slug:…} }.
// Si ANTHROPIC_API_KEY est absente, renvoie null → le rapport est généré sans
// commentaires (mention « indisponible »).

import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-opus-4-7";

export type CommentaryInput = {
  /** Libellé de semaine, ex « du 16 au 22 mai 2026 » */
  weekLabel: string;
  /** Date d'arrêté des données (ISO YYYY-MM-DD) */
  asOf: string;
  commodities: {
    slug: string;
    name: string;
    unit: string;
    last: number;
    weekChangePct: number | null;
    ytdPct: number | null;
    yearPct: number | null;
  }[];
};

export type CommodityCommentary = {
  generatedAt: string;
  model: string;
  /** Synthèse globale du marché de la semaine (2-4 phrases) */
  global: string;
  /** Commentaire par slug de matière première */
  perSlug: Record<string, string>;
  /** URLs des sources web consultées */
  sources: string[];
};

const SYSTEM = `Tu es analyste matières premières senior pour AzimutFinance, portail financier de la BRVM / zone UEMOA (Afrique de l'Ouest francophone).
Ta mission : expliquer, faits à l'appui, POURQUOI chaque matière première a évolué CETTE semaine.
- Utilise systématiquement l'outil de recherche web pour identifier les catalyseurs concrets de la semaine écoulée (météo, offre/demande, géopolitique, dollar, décisions de banques centrales, stocks, récoltes, grèves…). Ne te fie pas à tes seules connaissances.
- Rédige en français, ton factuel et professionnel, sans jargon inutile, sans conseil d'investissement.
- 2 à 4 phrases par matière première. Cite les chiffres clés quand c'est pertinent.
- Quand c'est pertinent, relie l'évolution aux enjeux BRVM/UEMOA (Côte d'Ivoire pour cacao/caoutchouc/palme, Mali/Burkina/Sénégal pour l'or, imports énergétiques pour le Brent, etc.).
- Le commentaire « global » (2 à 4 phrases) synthétise la tonalité d'ensemble de la semaine pour le complexe matières premières et son implication pour l'UEMOA.
RÉPONDS STRICTEMENT par un unique objet JSON valide, sans aucun texte avant ou après, de la forme :
{"global":"…","commentaries":{"<slug>":"…", …}}
Utilise exactement les slugs fournis comme clés.`;

function fmtPct(v: number | null): string {
  if (v == null || !isFinite(v)) return "n.d.";
  return (v >= 0 ? "+" : "") + v.toFixed(2) + " %";
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

/**
 * Échappe les caractères de contrôle (retours à la ligne, tabulations…) présents
 * BRUTS à l'intérieur des chaînes JSON — le modèle en insère parfois, ce qui
 * casse JSON.parse (« Bad control character in string literal »).
 */
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

export async function generateCommodityCommentary(
  input: CommentaryInput,
): Promise<CommodityCommentary | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const client = new Anthropic({ apiKey, maxRetries: 1 });

  const dataLines = input.commodities
    .map(
      (c) =>
        `- ${c.slug} — ${c.name} (${c.unit}) : dernier ${c.last}, semaine ${fmtPct(
          c.weekChangePct,
        )}, YTD ${fmtPct(c.ytdPct)}, 1 an ${fmtPct(c.yearPct)}`,
    )
    .join("\n");

  const userText = `Semaine ${input.weekLabel} — données de clôture arrêtées au ${input.asOf}.
Variations hebdomadaires des matières premières suivies :
${dataLines}

Pour CHAQUE matière première ci-dessus, recherche sur le web les faits marquants de cette semaine qui expliquent le mouvement, puis rédige le commentaire. Termine par le commentaire « global ».
Réponds uniquement par le JSON demandé.`;

  // Messages (boucle pause_turn : l'outil serveur peut épuiser ses itérations).
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userText },
  ];

  // Budget temps global : au-delà, on abandonne les commentaires (le rapport
  // est tout de même produit). Évite que la route pende indéfiniment si le
  // flux Claude se fige. La route a maxDuration=300 → on borne bien en deçà.
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
          tools: [
            { type: "web_search_20260209", name: "web_search", max_uses: 8 },
          ],
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
    console.error("[commoditiesCommentary] appel API échoué/expiré", e);
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
    console.error("[commoditiesCommentary] JSON introuvable dans la réponse.");
    return null;
  }

  let parsed: { global?: string; commentaries?: Record<string, string> };
  try {
    parsed = JSON.parse(sanitizeJsonControlChars(jsonStr));
  } catch (e) {
    console.error("[commoditiesCommentary] JSON.parse échoué", e);
    return null;
  }

  return {
    generatedAt: new Date().toISOString(),
    model: MODEL,
    global: (parsed.global ?? "").trim(),
    perSlug: parsed.commentaries ?? {},
    sources: collectSources(final.content),
  };
}
