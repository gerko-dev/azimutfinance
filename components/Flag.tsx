/**
 * Drapeau d'un pays via la bibliotheque flag-icons (SVG).
 * Equivalent visuel des emojis flags, mais s'affiche correctement sur Windows.
 *
 * Usage :
 *   <Flag code="CI" />              // taille par defaut (1em)
 *   <Flag code="ci" size="lg" />    // grand
 *   <Flag code="CI" className="rounded-sm shadow-sm" />
 */

const SIZE_CLASS: Record<string, string> = {
  xs: "text-[10px]",
  sm: "text-xs",
  md: "text-base",
  lg: "text-2xl",
  xl: "text-4xl",
};

export default function Flag({
  code,
  size = "md",
  className = "",
  title,
}: {
  code: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  title?: string;
}) {
  const norm = code.toLowerCase();
  return (
    <span
      className={`fi fi-${norm} ${SIZE_CLASS[size] ?? ""} ${className}`}
      title={title ?? code.toUpperCase()}
      aria-label={title ?? code.toUpperCase()}
      role="img"
    />
  );
}
