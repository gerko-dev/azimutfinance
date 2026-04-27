import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Client Supabase pour Server Components, Server Actions et Route Handlers.
 *
 * IMPORTANT Next 16 : `cookies()` est asynchrone — d'ou le `await` ci-dessous.
 *
 * Note: l'appel `setAll` peut echouer dans un Server Component (les cookies
 * ne peuvent pas etre modifies pendant le rendu). On l'ignore silencieusement
 * — le proxy.ts s'occupe du refresh de session pour les routes naviguees.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Appel depuis un Server Component pendant le rendu — ignore.
          }
        },
      },
    }
  );
}
