// === Types DB pour formations & inscriptions ===

import type {
  FormationCategory,
  FormationFormat,
  FormationLevel,
  FormationModule,
  FormationPricingType,
} from "@/lib/formations";

export type FormationRow = {
  id: string;
  slug: string;
  title: string;
  short_description: string;
  long_description: string;
  level: FormationLevel;
  format: FormationFormat;
  category: FormationCategory;
  modules: FormationModule[];
  prerequisites: string[];
  outcomes: string[];
  pricing_type: FormationPricingType;
  price_fcfa: number;
  tags: string[];
  accent_color: string | null;
  instructor_name: string | null;
  instructor_title: string | null;
  featured: boolean;
  published_at: string | null;
  registration_deadline: string | null;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
};

export type InscriptionStatus = "en_attente" | "confirmee" | "payee" | "annulee";

export type PaymentMethod =
  | "gratuit"
  | "orange_money"
  | "wave"
  | "virement"
  | "sur_place";

export type InscriptionRow = {
  id: string;
  formation_id: string;
  formation_slug: string;
  formation_title: string;
  user_id: string;
  user_username: string | null;
  status: InscriptionStatus;
  payment_method: PaymentMethod;
  montant_fcfa: number;
  full_name: string;
  email: string;
  phone: string;
  country: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type MyInscriptionRow = {
  id: string;
  formation_id: string;
  formation_slug: string;
  formation_title: string;
  status: InscriptionStatus;
  payment_method: PaymentMethod;
  montant_fcfa: number;
  created_at: string;
};

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };
