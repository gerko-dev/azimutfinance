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
  const next = searchParams.get("next") ?? "/compte";

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
