// Composant serveur : injecte un (ou plusieurs) bloc(s) JSON-LD schema.org.
// Centralise le pattern <script type="application/ld+json"> pour eviter de
// repeter `dangerouslySetInnerHTML` dans chaque page.

type JsonLdObject = Record<string, unknown>;

export default function JsonLd({
  data,
}: {
  /** Un objet JSON-LD, ou plusieurs (un <script> par entree). */
  data: JsonLdObject | JsonLdObject[];
}) {
  const blocks = Array.isArray(data) ? data : [data];
  return (
    <>
      {blocks.map((block, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(block) }}
        />
      ))}
    </>
  );
}
