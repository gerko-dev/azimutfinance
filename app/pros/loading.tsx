import ProSplash from "@/components/pros/ProSplash";

/**
 * Fallback Next.js pendant la transition de route vers /pros/*.
 * Affiche immediatement le splash (sans timer). ProShell prend le relais
 * cote client pour garantir une duree minimale de 3 secondes.
 */
export default function ProLoading() {
  return <ProSplash />;
}
