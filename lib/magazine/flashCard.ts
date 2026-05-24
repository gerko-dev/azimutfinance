import "server-only";

// Carte « flash news » pour réseaux sociaux (format portrait 4:5, 1080×1350).
// Photo plein cadre, logo AzimutFinance, pastille catégorie et cartouche titre,
// rangée d'icônes sociales en pied. Rendue en image via htmlToImage().

export type FlashCardInput = {
  title: string;
  /** Chapeau / sous-titre (1 phrase) affiché sous le titre, non gras. */
  dek: string;
  categoryLabel: string;
  categoryColor: string;
  /** Photo de fond en data URI (inlinée par la route) ; sinon dégradé de repli. */
  bgDataUri: string | null;
  /** Logo blanc en SVG inline (fond transparent). */
  logoSvg: string;
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Taille du titre dégressive selon la longueur, pour tenir dans le cartouche.
function titleSize(len: number): number {
  if (len > 150) return 40;
  if (len > 110) return 46;
  if (len > 80) return 52;
  return 60;
}

const SOCIAL = `
<svg viewBox="0 0 24 24"><path d="M18.244 2H21.5l-7.1 8.114L22.75 22h-6.49l-5.085-6.65L5.36 22H2.1l7.594-8.68L1.25 2h6.654l4.6 6.08L18.244 2Zm-1.14 18.07h1.8L7.02 3.83H5.09L17.104 20.07Z"/></svg>
<svg viewBox="0 0 24 24"><path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.13 1.45-2.13 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29ZM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13ZM7.12 20.45H3.55V9h3.57v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.22.79 24 1.77 24h20.45c.98 0 1.78-.78 1.78-1.73V1.73C24 .77 23.2 0 22.22 0Z"/></svg>
<svg viewBox="0 0 24 24"><path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07c0 6 4.39 10.97 10.13 11.87v-8.4H7.08v-3.47h3.05V9.43c0-3 1.79-4.67 4.53-4.67 1.31 0 2.68.24 2.68.24v2.95H15.83c-1.49 0-1.96.93-1.96 1.87v2.25h3.33l-.53 3.47h-2.8v8.4C19.61 23.04 24 18.07 24 12.07Z"/></svg>
<svg viewBox="0 0 24 24"><path d="M12 2.16c3.2 0 3.58.01 4.85.07 3.25.15 4.77 1.69 4.92 4.92.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.15 3.23-1.66 4.77-4.92 4.92-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-3.26-.15-4.77-1.7-4.92-4.92-.06-1.27-.07-1.65-.07-4.85s.01-3.58.07-4.85C2.38 3.93 3.9 2.39 7.15 2.24 8.42 2.18 8.8 2.16 12 2.16Zm0 3.68a6.16 6.16 0 1 0 0 12.32 6.16 6.16 0 0 0 0-12.32Zm0 10.16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm6.4-10.4a1.44 1.44 0 1 0 0 2.88 1.44 1.44 0 0 0 0-2.88Z"/></svg>`;

/** Document HTML complet d'une carte flash (le body fait exactement 1080×1350). */
export function renderFlashCardHtml(input: FlashCardInput): string {
  const { title, dek, categoryLabel, categoryColor, bgDataUri, logoSvg } = input;
  const bg = bgDataUri
    ? `background-image:url('${bgDataUri}');`
    : `background-image:linear-gradient(140deg, ${categoryColor}, #0b1220);`;
  const ts = titleSize(title.length);

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0;padding:0;}
html,body{width:1080px;height:1350px;}
body{font-family:"Segoe UI",Arial,Helvetica,sans-serif;background:#0b0d11;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.card{position:relative;width:1080px;height:1350px;overflow:hidden;background:#0b0d11;}
.photo{position:absolute;top:0;left:0;width:1080px;height:840px;${bg}background-size:cover;background-position:center;}
.scrim{position:absolute;top:0;left:0;width:1080px;height:260px;background:linear-gradient(180deg,rgba(8,10,14,.55),rgba(8,10,14,0));}
.logo{position:absolute;top:48px;right:56px;filter:drop-shadow(0 2px 8px rgba(0,0,0,.5));}
.logo svg{height:62px;width:auto;display:block;}
.titlecard{position:absolute;left:56px;right:56px;bottom:188px;background:#fff;border-radius:16px;padding:58px 50px 52px;box-shadow:0 24px 60px rgba(0,0,0,.35);}
.badge{position:absolute;top:0;left:46px;transform:translateY(-52%);display:inline-flex;align-items:center;background:#16181d;color:#fff;border-left:6px solid ${categoryColor};border-radius:8px;padding:13px 22px;font-size:24px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;box-shadow:0 8px 22px rgba(0,0,0,.28);}
.title{font-size:${ts}px;line-height:1.14;font-weight:800;color:#15171c;letter-spacing:-.4px;}
.dek{margin-top:24px;font-size:37px;line-height:1.34;font-weight:400;color:#46505c;}
.social{position:absolute;left:0;right:0;bottom:78px;display:flex;justify-content:center;align-items:center;gap:38px;}
.social svg{width:42px;height:42px;fill:#fff;opacity:.95;}
</style></head><body>
<div class="card">
  <div class="photo"></div>
  <div class="scrim"></div>
  <div class="logo">${logoSvg}</div>
  <div class="titlecard">
    <div class="badge">${esc(categoryLabel)}</div>
    <div class="title">${esc(title)}</div>
    ${dek ? `<div class="dek">${esc(dek)}</div>` : ""}
  </div>
  <div class="social">${SOCIAL}</div>
</div>
</body></html>`;
}
