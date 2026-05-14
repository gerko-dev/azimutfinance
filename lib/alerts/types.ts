import { formatTargetCode } from "@/lib/watchlists/types";

export type AlertType =
  | "price_threshold"
  | "daily_pct_change"
  | "bond_maturity_approach"
  | "news_mention"
  | "index_threshold"
  | "fx_threshold"
  | "custom";

export const ALERT_TYPE_LABEL: Record<AlertType, string> = {
  price_threshold: "Seuil de prix",
  daily_pct_change: "Variation % du jour",
  bond_maturity_approach: "Approche d'échéance obligation",
  news_mention: "Nouvelle actualité",
  index_threshold: "Seuil indice",
  fx_threshold: "Seuil taux de change",
  custom: "Personnalisée",
};

export const ALERT_TYPE_DESCRIPTION: Record<AlertType, string> = {
  price_threshold: "Notification quand un titre franchit un prix défini.",
  daily_pct_change:
    "Notification quand un titre fait +X % ou −X % sur la séance.",
  bond_maturity_approach:
    "Notification J-30 ou J-7 avant le détachement de coupon ou le remboursement.",
  news_mention:
    "Notification quand une actualité mentionne un titre que vous suivez.",
  index_threshold: "Notification quand un indice franchit un seuil défini.",
  fx_threshold: "Notification quand une paire de devises franchit un seuil.",
  custom:
    "Rappel libre (note + date) — ne se déclenche pas automatiquement, sert de pense-bête.",
};

export type AlertTargetType =
  | "stock"
  | "bond"
  | "index"
  | "currency"
  | "commodity"
  | "any";

export type Direction = "above" | "below" | "either";

/** Schémas typés des params par type d'alerte. Stockés en jsonb côté DB. */
export type AlertParams =
  | {
      type: "price_threshold";
      direction: "above" | "below";
      price: number;
    }
  | {
      type: "daily_pct_change";
      direction: Direction;
      threshold_pct: number;
    }
  | {
      type: "bond_maturity_approach";
      days_before: number; // 30, 7, 1...
      include_coupons?: boolean;
    }
  | {
      type: "news_mention";
    }
  | {
      type: "index_threshold";
      direction: "above" | "below";
      value: number;
    }
  | {
      type: "fx_threshold";
      direction: "above" | "below";
      value: number;
    }
  | {
      type: "custom";
      note: string;
      remind_at?: string; // ISO
    };

export type Alert = {
  id: string;
  user_id: string;
  name: string;
  alert_type: AlertType;
  target_type: AlertTargetType;
  target_code: string;
  params: Record<string, unknown>;
  active: boolean;
  last_triggered_at: string | null;
  snooze_until: string | null;
  created_at: string;
  updated_at: string;
};

export type AlertTrigger = {
  id: string;
  alert_id: string;
  user_id: string;
  triggered_at: string;
  value_at_trigger: Record<string, unknown> | null;
  message: string | null;
  read_at: string | null;
  email_sent_at: string | null;
};

export type AlertTriggerWithAlert = AlertTrigger & {
  alert_name: string;
  alert_type: AlertType;
  target_type: AlertTargetType;
  target_code: string;
};

/** Décrit lisiblement une alerte (utilisé pour les cartes + les emails). */
export function describeAlert(a: Alert): string {
  const p = a.params as Partial<{
    direction: string;
    price: number;
    value: number;
    threshold_pct: number;
    days_before: number;
    note: string;
  }>;
  const prettyCode = formatTargetCode(a.target_type, a.target_code);
  const code = a.target_code !== "*" ? ` ${prettyCode}` : "";
  switch (a.alert_type) {
    case "price_threshold":
      return `Prix${code} ${p.direction === "above" ? "≥" : "≤"} ${
        p.price?.toLocaleString("fr-FR") ?? "—"
      } FCFA`;
    case "daily_pct_change":
      return `Variation jour${code} ${
        p.direction === "above"
          ? "≥ +"
          : p.direction === "below"
            ? "≤ −"
            : "|"
      }${p.threshold_pct ?? "—"} %${p.direction === "either" ? "|" : ""}`;
    case "bond_maturity_approach":
      return `Obligation${code} : J-${p.days_before ?? 30}`;
    case "news_mention":
      return `Nouvelle actu mentionnant${code || " un titre suivi"}`;
    case "index_threshold":
      return `Indice${code} ${p.direction === "above" ? "≥" : "≤"} ${
        p.value?.toLocaleString("fr-FR") ?? "—"
      }`;
    case "fx_threshold":
      return `${prettyCode} ${p.direction === "above" ? "≥" : "≤"} ${
        p.value?.toLocaleString("fr-FR") ?? "—"
      }`;
    case "custom":
      return p.note ? p.note : "Rappel personnalisé";
  }
}
