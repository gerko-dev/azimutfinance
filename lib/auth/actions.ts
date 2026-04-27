"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AuthState = {
  error?: string;
  success?: string;
} | null;

export type OAuthProvider = "google" | "facebook" | "twitter" | "apple";

const MIN_PASSWORD = 8;

async function getOrigin(): Promise<string> {
  const h = await headers();
  return (
    h.get("origin") ||
    h.get("referer")?.replace(/\/[^/]*$/, "") ||
    "https://azimutfinance.vercel.app"
  );
}

function translateAuthError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials"))
    return "Email ou mot de passe incorrect.";
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
// Connexion email + mot de passe
// ----------------------------------------------------------------
export async function signInAction(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const redirectTo = String(formData.get("redirect") ?? "/compte");

  if (!email || !password) {
    return { error: "Email et mot de passe requis." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: translateAuthError(error.message) };
  }

  revalidatePath("/", "layout");
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
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();

  if (!email || !password) {
    return { error: "Email et mot de passe requis." };
  }
  if (password.length < MIN_PASSWORD) {
    return { error: `Mot de passe trop court (minimum ${MIN_PASSWORD} caractères).` };
  }

  const origin = await getOrigin();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: fullName ? { full_name: fullName } : undefined,
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    return { error: translateAuthError(error.message) };
  }

  return {
    success:
      "Inscription réussie. Vérifie ta boîte mail et clique sur le lien de confirmation pour activer ton compte.",
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
    redirectTo: `${origin}/auth/callback?next=/compte`,
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
