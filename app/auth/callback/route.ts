import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Callback OAuth + confirmation email.
 *
 * Supabase redirige ici dans 3 cas :
 *   - apres un signInWithOAuth (Google, Facebook, ...)
 *   - apres confirmation d'email d'inscription
 *   - apres clic sur un lien de reset password
 *
 * Le code dans l'URL est echange contre une session (cookies).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Sans `next` explicite (connexion OAuth, confirmation d'email), on renvoie
  // le membre sur sa page d'accueil ("/"). Un `next` explicite (ex. reset de
  // mot de passe → /nouveau-mot-de-passe) est respecté.
  const next = searchParams.get("next") ?? "/";

  // Supabase peut rediriger ici avec une erreur explicite plutôt qu'un `code`
  // (OAuth refusé par l'utilisateur, lien de confirmation/reset expiré, ...).
  // On remonte le message réel à /connexion au lieu d'un générique.
  const oauthError =
    searchParams.get("error_description") || searchParams.get("error");
  if (oauthError) {
    return NextResponse.redirect(
      `${origin}/connexion?error=${encodeURIComponent(oauthError)}`,
    );
  }

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error, data } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Si le profil n'a pas encore ete onboarde, on detoure vers /bienvenue
      // (sauf si un `next` explicite a ete demande, ex: reset password -> /compte).
      const explicitNext = searchParams.get("next");
      if (!explicitNext && data.user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("onboarded_at")
          .eq("id", data.user.id)
          .single();
        if (!profile?.onboarded_at) {
          return NextResponse.redirect(`${origin}/bienvenue`);
        }
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(
    `${origin}/connexion?error=${encodeURIComponent(
      "Lien d'authentification invalide ou expiré."
    )}`
  );
}
