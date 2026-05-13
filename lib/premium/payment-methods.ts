/**
 * Numéros de téléphone perso sur lesquels les utilisateurs envoient leur
 * paiement Premium en mode "Option A — paiement manuel".
 *
 * Plus tard, quand l'entreprise sera créée et CinetPay branché, ce fichier
 * pourra être supprimé.
 */

export type PaymentMethodCode = "wave" | "orange_money" | "mtn_momo" | "moov_money";

export type PaymentMethodConfig = {
  code: PaymentMethodCode;
  label: string;
  /** Numéro de téléphone à afficher (format international, ex. "+225 07 00 00 00 00") */
  phone: string;
  /** Nom à afficher comme bénéficiaire (tel qu'il apparaît dans l'app du payeur) */
  beneficiary: string;
  /** Frais côté payeur (texte court à afficher pour info) */
  fees?: string;
  enabled: boolean;
};

export const PAYMENT_METHODS: PaymentMethodConfig[] = [
  {
    code: "wave",
    label: "Wave",
    phone: "+225 07 10 41 12 00",
    beneficiary: "AzimutFinance",
    fees: "0% pour le payeur",
    enabled: true,
  },
  {
    code: "orange_money",
    label: "Orange Money",
    phone: "+225 07 10 41 12 00",
    beneficiary: "AzimutFinance",
    fees: "Frais opérateur standard",
    enabled: true,
  },
  {
    code: "mtn_momo",
    label: "MTN Mobile Money",
    phone: "+225 00 00 00 00 00",
    beneficiary: "AzimutFinance",
    fees: "Frais opérateur standard",
    enabled: false,
  },
  {
    code: "moov_money",
    label: "Moov Money",
    phone: "+225 00 00 00 00 00",
    beneficiary: "AzimutFinance",
    fees: "Frais opérateur standard",
    enabled: false,
  },
];

export const PAYMENT_METHOD_LABEL: Record<PaymentMethodCode, string> = {
  wave: "Wave",
  orange_money: "Orange Money",
  mtn_momo: "MTN Mobile Money",
  moov_money: "Moov Money",
};

export function getEnabledPaymentMethods(): PaymentMethodConfig[] {
  return PAYMENT_METHODS.filter((m) => m.enabled);
}

export function isValidPaymentMethod(code: string): code is PaymentMethodCode {
  return code === "wave" || code === "orange_money" || code === "mtn_momo" || code === "moov_money";
}
