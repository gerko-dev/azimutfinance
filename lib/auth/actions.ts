"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AuthState = {
  error?: string;
  success?: string;
  /**
   * Drapeau structuré pour les cas que l'UI doit traiter spécifiquement.
   * "email_not_confirmed" : permet à LoginForm d'afficher le bouton de renvoi
   * du mail de confirmation (au lieu d'un simple message d'erreur).
   */
  code?: "email_not_confirmed";
} | null;

export type OAuthProvider = "google" | "facebook" | "twitter" | "apple";

const MIN_PASSWORD = 8;

async function getOrigin(): Promise<string> {
  // URL canonique : variable d'environnement explicite en priorité, sinon
  // l'en-tête Origin (fiable sur les server actions POST), sinon le domaine
  // de production. (On évite le fallback bricolé sur `referer`.)
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
  if (fromEnv) return fromEnv;
  const h = await headers();
  return h.get("origin") || "https://azimutfinance.com";
}

function translateAuthError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials"))
    return "Identifiant ou mot de passe incorrect.";
  if (m.includes("user already registered"))
    return "Un compte existe déjà avec cet email.";
  if (m.includes("email not confirmed"))
    return "Email non confirmé. Vérifie ta boîte mail.";
  if (m.includes("password") && m.includes("should be at least"))
    return `Mot de passe trop court (minimum ${MIN_PASSWORD} caractères).`;
  if (m.includes("rate limit") || m.includes("too many"))
    return "Trop de tentatives. Réessaie dans quelques minutes.";
  if (m.includes("network") || m.includes("fetch"))
    return "Problème de connexion. Réessaie.";
  return msg;
}

// ----------------------------------------------------------------
// Connexion : identifiant (email OU nom d'utilisateur) + mot de passe
// ----------------------------------------------------------------

/**
 * Résout un identifiant de connexion en email. Un identifiant sans « @ » est
 * traité comme un nom d'utilisateur et résolu via la RPC email_for_username.
 * Renvoie null si le nom d'utilisateur est inconnu.
 */
async function resolveLoginEmail(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  identifier: string,
): Promise<string | null> {
  if (identifier.includes("@")) return identifier.toLowerCase();
  const { data } = await supabase.rpc("email_for_username", {
    p_username: identifier,
  });
  return data ? String(data).toLowerCase() : null;
}

export async function signInAction(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const identifier = String(formData.get("identifier") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const redirectTo = String(formData.get("redirect") ?? "/compte");

  if (!identifier || !password) {
    return { error: "Identifiant et mot de passe requis." };
  }

  const supabase = await createSupabaseServerClient();

  // L'identifiant peut être un email OU un nom d'utilisateur.
  const email = await resolveLoginEmail(supabase, identifier);
  if (!email) {
    // Message générique : ne révèle pas si le nom d'utilisateur existe.
    return { error: "Identifiant ou mot de passe incorrect." };
  }

  const { error, data } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Email non confirmé : on remonte un drapeau structuré pour que LoginForm
    // propose de renvoyer le mail de confirmation.
    if (error.message.toLowerCase().includes("email not confirmed")) {
      return {
        error: translateAuthError(error.message),
        code: "email_not_confirmed",
      };
    }
    return { error: translateAuthError(error.message) };
  }

  revalidatePath("/", "layout");

  // Onboarding obligatoire : tout utilisateur non onboardé est détourné vers
  // /bienvenue, quel que soit le `redirect` demandé — sinon l'onboarding est
  // contournable via n'importe quel lien ?redirect=...
  if (data.user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarded_at")
      .eq("id", data.user.id)
      .single();
    if (!profile?.onboarded_at) {
      redirect("/bienvenue");
    }
  }

  redirect(redirectTo);
}

// ----------------------------------------------------------------
// Inscription email + mot de passe
// ----------------------------------------------------------------
export async function signUpAction(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!email || !password) {
    return { error: "Email et mot de passe requis." };
  }
  if (!username) {
    return { error: "Nom d'utilisateur requis." };
  }
  if (!/^[a-z0-9_]{3,20}$/.test(username)) {
    return {
      error:
        "Nom d'utilisateur invalide : 3 à 20 caractères, lettres, chiffres et _ uniquement.",
    };
  }
  if (password.length < MIN_PASSWORD) {
    return { error: `Mot de passe trop court (minimum ${MIN_PASSWORD} caractères).` };
  }
  if (confirm !== password) {
    return { error: "Les deux mots de passe ne correspondent pas." };
  }

  const origin = await getOrigin();
  const supabase = await createSupabaseServerClient();

  // Disponibilité du nom d'utilisateur. La RLS empêche un visiteur anonyme de
  // lire profiles → on passe par une RPC security definer. Si la RPC n'existe
  // pas encore (migration non appliquée), `available` est null → on n' pas de
  // blocage et le trigger handle_new_user reste le filet de sécurité.
  const { data: available } = await supabase.rpc("username_available", {
    p_username: username,
  });
  if (available === false) {
    return {
      error: "Ce nom d'utilisateur est déjà pris. Choisis-en un autre.",
    };
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { username },
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    return { error: translateAuthError(error.message) };
  }

  // Anti-énumération Supabase : inscrire un email DÉJÀ confirmé renvoie un
  // faux succès (data.user présent mais `identities` vide) et n'envoie aucun
  // mail. On le détecte pour afficher un message clair plutôt qu'un « vérifie
  // ta boîte mail » qui n'arriverait jamais.
  if (data.user && (data.user.identities?.length ?? 0) === 0) {
    return {
      error:
        "Un compte existe déjà avec cet email. Connecte-toi, ou réinitialise ton mot de passe si tu l'as oublié.",
    };
  }

  // Si la confirmation d'email est désactivée côté Supabase, signUp renvoie
  // directement une session (cookies posés par le client serveur) : l'utilisateur
  // est déjà connecté. On enchaîne sur l'onboarding au lieu d'afficher un message
  // « vérifie ta boîte mail » trompeur qui le laisserait bloqué sur /inscription.
  if (data.session) {
    revalidatePath("/", "layout");
    redirect("/bienvenue");
  }

  return {
    success:
      "Inscription réussie. Vérifie ta boîte mail et clique sur le lien de confirmation pour activer ton compte.",
  };
}

// ----------------------------------------------------------------
// Renvoi du mail de confirmation d'inscription
// (l'utilisateur n'a pas reçu / a laissé expirer le lien initial)
// ----------------------------------------------------------------
export async function resendConfirmationAction(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const identifier = String(formData.get("identifier") ?? "").trim();
  if (!identifier) return { error: "Email ou nom d'utilisateur requis." };

  const supabase = await createSupabaseServerClient();
  // L'identifiant saisi à la connexion peut être un nom d'utilisateur : on le
  // résout en email (sinon on tente la valeur brute, resend renverra l'erreur).
  const email = (await resolveLoginEmail(supabase, identifier)) ?? identifier;

  const origin = await getOrigin();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });

  if (error) {
    return { error: translateAuthError(error.message) };
  }

  // Message volontairement neutre (ne divulgue pas si le compte existe / est
  // déjà confirmé — Supabase n'envoie rien dans ces cas).
  return {
    success:
      "Si un compte non confirmé existe avec cet email, un nouveau lien de confirmation vient de t'être envoyé.",
  };
}

// ----------------------------------------------------------------
// Deconnexion
// ----------------------------------------------------------------
export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}

// ----------------------------------------------------------------
// Reinitialisation mot de passe (envoi du mail)
// ----------------------------------------------------------------
export async function resetPasswordRequestAction(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { error: "Email requis." };

  const origin = await getOrigin();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    // Le lien doit mener vers la page de définition d'un nouveau mot de passe,
    // pas directement vers /compte (sinon l'utilisateur est juste connecté
    // sans jamais pouvoir changer son mot de passe oublié).
    redirectTo: `${origin}/auth/callback?next=/nouveau-mot-de-passe`,
  });

  if (error) {
    return { error: translateAuthError(error.message) };
  }

  // On retourne toujours le meme message, qu'un compte existe ou non,
  // pour ne pas divulguer si un email est enregistre.
  return {
    success:
      "Si un compte existe avec cet email, un lien de réinitialisation vient de t'être envoyé.",
  };
}

// ----------------------------------------------------------------
// Definition d'un nouveau mot de passe.
// Appelee depuis /nouveau-mot-de-passe : soit apres le clic sur le lien de
// reinitialisation (/auth/callback a etabli la session), soit par un
// utilisateur deja connecte qui veut changer son mot de passe.
// ----------------------------------------------------------------
export async function updatePasswordAction(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!password) {
    return { error: "Mot de passe requis." };
  }
  if (password.length < MIN_PASSWORD) {
    return { error: `Mot de passe trop court (minimum ${MIN_PASSWORD} caractères).` };
  }
  if (confirm !== password) {
    return { error: "Les deux mots de passe ne correspondent pas." };
  }

  const supabase = await createSupabaseServerClient();
  // Une session active est requise : elle est etablie par /auth/callback apres
  // le clic sur le lien de reinitialisation (ou l'utilisateur est deja connecte).
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      error:
        "Session expirée ou lien invalide. Redemande un lien depuis « Mot de passe oublié ».",
    };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { error: translateAuthError(error.message) };
  }

  revalidatePath("/", "layout");
  redirect("/compte");
}

// ----------------------------------------------------------------
// Connexion via fournisseur OAuth (Google, Facebook, Twitter, Apple)
// Le provider est lu depuis un input hidden "provider" du formulaire.
// ----------------------------------------------------------------
const VALID_PROVIDERS: readonly OAuthProvider[] = [
  "google",
  "facebook",
  "twitter",
  "apple",
];

export async function signInWithProviderAction(formData: FormData) {
  const provider = String(formData.get("provider") ?? "") as OAuthProvider;
  if (!VALID_PROVIDERS.includes(provider)) {
    redirect(
      `/connexion?error=${encodeURIComponent("Fournisseur OAuth inconnu.")}`
    );
  }

  const origin = await getOrigin();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    redirect(
      `/connexion?error=${encodeURIComponent(translateAuthError(error.message))}`
    );
  }

  if (data?.url) {
    redirect(data.url);
  }
}
