import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// ─── BLOCAGE USER-AGENT SCRAPERS ──────────────────────────────────────────
// Liste defensive : on bloque les UA flagrants (libs HTTP standard, bots
// IA d'entrainement, scrapers SEO connus). Patterns sensibles a la casse
// transformes en lowercase avant comparaison. Whitelist des bots
// d'indexation et de preview sociaux pour preserver SEO.
//
// Limites : trivialement bypassable par un scraper qui usurpe l'UA d'un
// Chrome standard. Cette couche filtre uniquement le tout-venant ; pour
// les scrapers plus serieux il faut Cloudflare ou rate-limiting (non
// implementes ici).
const BLOCKED_UA_PATTERNS = [
  // ── Bots IA d'entrainement ─────────────────────────────────────────────
  "gptbot",
  "chatgpt-user",
  "oai-searchbot",
  "claudebot",
  "claude-web",
  "anthropic-ai",
  "google-extended",
  "ccbot",
  "perplexitybot",
  "perplexity-user",
  "cohere-ai",
  "bytespider",
  "amazonbot",
  "applebot-extended",
  "diffbot",
  "meta-externalagent",
  "imagesiftbot",
  "omgilibot",
  "webzio-extended",
  "youbot",
  "timpibot",
  "velenpubliccrawler",
  "dataforseobot",
  "awariobot",
  // ── Libs HTTP / scrapers generiques ───────────────────────────────────
  "python-requests",
  "python-urllib",
  "aiohttp",
  "scrapy",
  "curl/",
  "wget/",
  "libwww-perl",
  "java/",
  "go-http-client",
  "node-fetch",
  "http_request2",
  "okhttp",
  "ruby",
  "winhttp",
  // ── Crawlers SEO/marketing intrusifs ──────────────────────────────────
  "semrushbot",
  "ahrefsbot",
  "mj12bot",
  "dotbot",
  "petalbot",
  "zoominfobot",
  "serpstatbot",
  "rogerbot",
  "screaming frog",
  // ── Outils navigateur automatises (sauf Vercel / previews) ────────────
  "phantomjs",
  "selenium",
  "headlesschrome",
  "puppeteer",
];

// Whitelist : meme si l'UA contient "bot" ou similaire, on autorise.
const ALLOWED_BOT_PATTERNS = [
  "googlebot",
  "bingbot",
  "duckduckbot",
  "slurp",        // Yahoo
  "yandexbot",
  "baiduspider",
  "facebookexternalhit",
  "facebot",
  "linkedinbot",
  "twitterbot",
  "whatsapp",
  "slackbot",
  "telegrambot",
  "discordbot",
  "applebot",     // distinct de Applebot-Extended (entrainement)
  "vercel-screenshot", // preview deployment screenshots
];

function isBlockedUserAgent(ua: string): boolean {
  if (!ua) return false; // UA vide : laisse passer (clients legitimes en wifi capt portal etc)
  const lower = ua.toLowerCase();
  // Whitelist d'abord
  for (const allow of ALLOWED_BOT_PATTERNS) {
    if (lower.includes(allow)) return false;
  }
  for (const block of BLOCKED_UA_PATTERNS) {
    if (lower.includes(block)) return true;
  }
  return false;
}

/**
 * Next.js 16 proxy (anciennement middleware).
 *
 * Roles :
 *   0. Bloquer les User-Agents scrapers/bots IA connus (defense-en-couches
 *      en complement de robots.txt et X-Robots-Tag).
 *   1. Rafraichir le cookie de session Supabase a chaque requete
 *      (sinon les sessions expirent et l'utilisateur est deconnecte
 *      sans s'en rendre compte).
 *   2. Proteger les routes privees : /compte/* redirige vers /connexion
 *      si pas de session.
 *
 * Note : la verification d'autorisation fine (role 'pro' vs 'member',
 * acces aux routes /pros/*, etc.) doit AUSSI etre faite cote Server
 * Component / Server Action — le proxy ne suffit pas (cf. doc Next 16
 * authentication.md, "do not rely on proxy alone").
 */
export async function proxy(request: NextRequest) {
  // ─── 0. Blocage scraper avant toute logique auth/db ──────────────────
  const ua = request.headers.get("user-agent") ?? "";
  if (isBlockedUserAgent(ua)) {
    return new NextResponse(
      "Access denied. This site does not authorize automated extraction or AI training. See /robots.txt for crawl policy.",
      {
        status: 403,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "X-Robots-Tag": "noindex, nofollow",
        },
      },
    );
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: getUser() doit etre appele juste apres createServerClient.
  // Ne PAS inserer d'autre logique entre les deux (cf. docs @supabase/ssr).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Routes protegees : redirige vers /connexion si pas de session
  if (
    !user &&
    (pathname.startsWith("/compte") || pathname.startsWith("/bienvenue"))
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/connexion";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  // Inverse : si deja connecte, /connexion et /inscription redirigent vers /compte
  if (user && (pathname === "/connexion" || pathname === "/inscription")) {
    const url = request.nextUrl.clone();
    url.pathname = "/compte";
    return NextResponse.redirect(url);
  }

  // Sanctions : si l'utilisateur est suspendu, on le force sur /suspendu.
  // On lit DIRECTEMENT la colonne suspended_until via la RLS de profiles
  // (l'utilisateur peut lire son propre profil), pas via une RPC, pour
  // etre resilient meme si sanctions.sql n'a pas encore ete execute.
  if (user) {
    const isAuthRoute =
      pathname.startsWith("/connexion") ||
      pathname.startsWith("/inscription") ||
      pathname.startsWith("/auth") ||
      pathname === "/suspendu";
    if (!isAuthRoute) {
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("suspended_until")
        .eq("id", user.id)
        .maybeSingle();
      if (error) {
        // Colonne absente (sanctions.sql pas encore execute) ou autre.
        // On loge pour diagnostic mais on laisse passer pour ne pas bloquer
        // tout le site sur une erreur infra.
        console.warn("[proxy] suspension check failed:", error.message);
      } else if (profile && (profile as { suspended_until: string | null }).suspended_until) {
        const until = new Date(
          (profile as { suspended_until: string }).suspended_until,
        );
        if (!isNaN(until.getTime()) && until.getTime() > Date.now()) {
          const url = request.nextUrl.clone();
          url.pathname = "/suspendu";
          url.search = "";
          return NextResponse.redirect(url);
        }
      }
    }
  }

  return response;
}

export const config = {
  matcher: [
    // Tout sauf les assets statiques et les images Next
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
