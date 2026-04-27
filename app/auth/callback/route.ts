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
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(
    `${origin}/connexion?error=${encodeURIComponent(
      "Lien d'authentification invalide ou expiré."
    )}`
  );
}
