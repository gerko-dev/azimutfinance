import type { EmailTemplate } from "./blocks";

/**
 * Templates par defaut, codes en dur. Servent de :
 * 1. Seed initial pour la table email_templates
 * 2. Fallback si la requete DB echoue (degradation gracieuse)
 *
 * Pour les modifier, edite la version en DB via /admin/email-templates.
 * Ce fichier reste la "source de verite" minimale en cas de wipe DB.
 */

const COMMON: Pick<
  EmailTemplate,
  "header_brand_name" | "header_brand_tagline" | "header_logo_url" | "accent_color" | "footer_text"
> = {
  header_brand_name: "AzimutFinance",
  header_brand_tagline: "Le portail BRVM / UEMOA",
  header_logo_url: null,
  accent_color: "#1d4ed8",
  footer_text:
    "Une question ? Réponds à cet email ou écris-nous à contact@azimutfinance.com.",
};

export const DEFAULT_TEMPLATES: Record<string, EmailTemplate> = {
  "premium-validated": {
    slug: "premium-validated",
    subject: "Ton abonnement Premium AzimutFinance est actif",
    ...COMMON,
    body: [
      { type: "heading", level: 1, text: "✓ Bienvenue dans Premium" },
      { type: "paragraph", text: "Bonjour {{full_name}}," },
      {
        type: "paragraph",
        text: "Merci ! Nous avons bien reçu ton paiement et ton abonnement Premium est désormais actif.",
      },
      {
        type: "callout",
        tone: "success",
        title: "Détails de ton abonnement",
        text: "Plan : {{plan_label}} — {{amount}}\nAccès valide jusqu'au {{premium_until}}",
      },
      {
        type: "paragraph",
        text: "Tu peux maintenant profiter de toutes les analyses macro UEMOA, des outils Pro (YTM, screener, alertes), et des données historiques étendues sur la BRVM.",
      },
      {
        type: "button",
        text: "Accéder à mon compte",
        url: "{{account_url}}",
      },
      { type: "paragraph", text: "L'équipe AzimutFinance" },
    ],
  },

  "premium-expiring-soon": {
    slug: "premium-expiring-soon",
    subject: "Ton accès Premium expire dans {{days_left}} jours",
    ...COMMON,
    body: [
      { type: "heading", level: 1, text: "Ton Premium expire bientôt" },
      { type: "paragraph", text: "Bonjour {{full_name}}," },
      {
        type: "paragraph",
        text: "Ton abonnement Premium {{plan_label}} arrive à échéance le {{premium_until}} — soit dans {{days_left}} jours.",
      },
      {
        type: "callout",
        tone: "warning",
        title: "Pour ne pas perdre l'accès",
        text: "Renouvelle dès maintenant pour continuer à profiter des analyses Macro UEMOA, des outils Pro et des données historiques étendues. Aucune interruption.",
      },
      {
        type: "button",
        text: "Renouveler maintenant",
        url: "{{premium_url}}",
      },
      {
        type: "paragraph",
        text: "Si tu choisis de ne pas renouveler, ton compte basculera automatiquement en Membre (gratuit) le {{premium_until}}. Tu pourras toujours te réabonner plus tard.",
      },
      { type: "paragraph", text: "L'équipe AzimutFinance" },
    ],
  },

  "premium-rejected": {
    slug: "premium-rejected",
    subject: "Ton paiement AzimutFinance n'a pas pu être validé",
    ...COMMON,
    body: [
      { type: "heading", level: 1, text: "Paiement non validé" },
      { type: "paragraph", text: "Bonjour {{full_name}}," },
      {
        type: "paragraph",
        text: "Nous avons examiné la déclaration de paiement que tu nous as transmise pour l'abonnement Premium {{plan_label}} ({{amount}}), mais nous n'avons pas pu la valider.",
      },
      {
        type: "callout",
        tone: "warning",
        title: "Motif",
        text: "{{rejection_reason}}",
      },
      {
        type: "paragraph",
        text: "Si tu penses qu'il s'agit d'une erreur, réponds simplement à cet email en joignant la référence de ta transaction et une capture d'écran. Tu peux aussi relancer un paiement depuis ton compte.",
      },
      {
        type: "button",
        text: "Refaire un paiement",
        url: "{{premium_url}}",
        color: "#0f172a",
      },
      { type: "paragraph", text: "L'équipe AzimutFinance" },
    ],
  },
};

export const EMAIL_TEMPLATE_SLUGS = Object.keys(DEFAULT_TEMPLATES);

export const EMAIL_TEMPLATE_LABELS: Record<string, string> = {
  "premium-validated": "Validation paiement Premium",
  "premium-expiring-soon": "Relance J-3 avant expiration",
  "premium-rejected": "Rejet paiement Premium",
};

export const EMAIL_TEMPLATE_DESCRIPTIONS: Record<string, string> = {
  "premium-validated":
    "Envoyé quand un admin valide une déclaration de paiement et active l'abonnement.",
  "premium-expiring-soon":
    "Envoyé automatiquement 3 jours avant la fin de l'abonnement, pour pousser le renouvellement.",
  "premium-rejected":
    "Envoyé quand un admin rejette une déclaration de paiement, avec le motif.",
};
