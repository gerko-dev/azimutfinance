import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Next.js 16 proxy (anciennement middleware).
 *
 * Roles :
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
