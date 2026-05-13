/**
 * Renderer pur : EmailTemplate + variables -> { subject, html, text }
 * Compatible client et serveur (pas de "server-only").
 *
 * Contraintes email :
 * - Styles inline obligatoires (Gmail strippe les <style>)
 * - Table layout pour la coque (max 600px, centrage)
 * - Pas de flex / grid (support patché chez Outlook desktop)
 * - Images : max-width:100%; height:auto; display:block
 */

import type {
  EmailBlock,
  EmailCalloutTone,
  EmailImageWidth,
  EmailTemplate,
  EmailVariables,
} from "./blocks";

// ============================================================
// Helpers
// ============================================================

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Remplace {{var}} dans une chaine par les valeurs fournies. */
export function interpolate(text: string, vars: EmailVariables): string {
  return text.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_, key) => {
    return vars[key] ?? "";
  });
}

/** Convertit un texte avec saut de lignes + URLs en HTML simple. */
function textToInlineHtml(text: string): string {
  const escaped = escapeHtml(text);
  // Detection URL simple (http/https)
  const linkified = escaped.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" style="color:#1d4ed8;text-decoration:underline;">$1</a>',
  );
  return linkified.replace(/\n/g, "<br />");
}

const CALLOUT_STYLES: Record<EmailCalloutTone, { bg: string; border: string; text: string; titleColor: string }> = {
  info:     { bg: "#eff6ff", border: "#bfdbfe", text: "#1e3a8a", titleColor: "#1e40af" },
  warning:  { bg: "#fffbeb", border: "#fde68a", text: "#78350f", titleColor: "#92400e" },
  success:  { bg: "#ecfdf5", border: "#a7f3d0", text: "#064e3b", titleColor: "#065f46" },
  neutral:  { bg: "#f8fafc", border: "#e2e8f0", text: "#334155", titleColor: "#0f172a" },
};

const IMAGE_MAX_WIDTH: Record<EmailImageWidth, string> = {
  narrow: "400px",
  wide:   "536px",  // 600 - 2*32 padding
  full:   "100%",
};

const SPACER_SIZE: Record<NonNullable<Extract<EmailBlock, { type: "spacer" }>["size"]>, string> = {
  sm: "8px",
  md: "16px",
  lg: "32px",
};

// ============================================================
// Render bloc -> HTML
// ============================================================

function renderBlockHtml(block: EmailBlock, vars: EmailVariables, accent: string): string {
  switch (block.type) {
    case "paragraph": {
      const html = textToInlineHtml(interpolate(block.text, vars));
      const size = block.lead ? "16px" : "14px";
      const color = block.lead ? "#0f172a" : "#334155";
      const weight = block.lead ? "500" : "400";
      return `<p style="margin:0 0 16px 0;font-size:${size};line-height:1.6;color:${color};font-weight:${weight};">${html}</p>`;
    }

    case "heading": {
      const text = escapeHtml(interpolate(block.text, vars));
      const tag = `h${block.level}`;
      const sizes = { 1: "22px", 2: "18px", 3: "15px" };
      const margins = { 1: "0 0 16px 0", 2: "24px 0 12px 0", 3: "20px 0 8px 0" };
      const weight = block.level === 1 ? "600" : "600";
      return `<${tag} style="margin:${margins[block.level]};font-size:${sizes[block.level]};line-height:1.3;color:#0f172a;font-weight:${weight};">${text}</${tag}>`;
    }

    case "image": {
      if (!block.src) return "";
      const src = escapeHtml(block.src);
      const alt = escapeHtml(block.alt);
      const maxW = IMAGE_MAX_WIDTH[block.width ?? "wide"];
      const captionHtml = block.caption
        ? `<div style="font-size:11px;color:#64748b;text-align:center;margin-top:6px;font-style:italic;">${escapeHtml(interpolate(block.caption, vars))}</div>`
        : "";
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 16px 0;">
  <tr><td align="center">
    <img src="${src}" alt="${alt}" style="display:block;max-width:${maxW};width:100%;height:auto;border-radius:6px;" />
    ${captionHtml}
  </td></tr>
</table>`;
    }

    case "button": {
      const text = escapeHtml(interpolate(block.text, vars));
      const url = escapeHtml(interpolate(block.url, vars));
      const color = block.color || accent;
      return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px 0;">
  <tr><td style="border-radius:6px;background:${color};">
    <a href="${url}" style="display:inline-block;padding:11px 22px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;">${text}</a>
  </td></tr>
</table>`;
    }

    case "list": {
      const tag = block.ordered ? "ol" : "ul";
      const items = block.items
        .map(
          (item) =>
            `<li style="margin:0 0 6px 0;font-size:14px;line-height:1.6;color:#334155;">${textToInlineHtml(interpolate(item, vars))}</li>`,
        )
        .join("");
      return `<${tag} style="margin:0 0 16px 0;padding-left:22px;">${items}</${tag}>`;
    }

    case "callout": {
      const s = CALLOUT_STYLES[block.tone];
      const title = block.title
        ? `<div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:${s.titleColor};margin-bottom:4px;">${escapeHtml(interpolate(block.title, vars))}</div>`
        : "";
      const body = textToInlineHtml(interpolate(block.text, vars));
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${s.bg};border:1px solid ${s.border};border-radius:8px;margin:8px 0 20px 0;">
  <tr><td style="padding:14px 18px;">
    ${title}
    <div style="font-size:14px;line-height:1.5;color:${s.text};">${body}</div>
  </td></tr>
</table>`;
    }

    case "divider":
      return `<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />`;

    case "spacer":
      return `<div style="height:${SPACER_SIZE[block.size ?? "md"]};line-height:${SPACER_SIZE[block.size ?? "md"]};">&nbsp;</div>`;
  }
}

// ============================================================
// Coque (shell) + assemblage final
// ============================================================

function renderShellHtml(args: {
  brandName: string;
  brandTagline: string;
  logoUrl: string | null;
  footerText: string;
  contentHtml: string;
}): string {
  const brandName = escapeHtml(args.brandName);
  const brandTagline = escapeHtml(args.brandTagline);
  const footerHtml = textToInlineHtml(args.footerText);

  const headerLeft = args.logoUrl
    ? `<img src="${escapeHtml(args.logoUrl)}" alt="${brandName}" style="display:block;height:36px;width:auto;" />`
    : `<div style="font-size:18px;font-weight:600;color:#0f172a;">${brandName}</div>
       <div style="font-size:12px;color:#64748b;margin-top:2px;">${brandTagline}</div>`;

  return `<!doctype html>
<html lang="fr">
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;border:1px solid #e2e8f0;max-width:600px;width:100%;">
            <tr>
              <td style="padding:24px 32px;border-bottom:1px solid #e2e8f0;">
                ${headerLeft}
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                ${args.contentHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;line-height:1.5;">
                ${footerHtml}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

// ============================================================
// Render bloc -> texte (fallback)
// ============================================================

function renderBlockText(block: EmailBlock, vars: EmailVariables): string {
  switch (block.type) {
    case "paragraph":
      return interpolate(block.text, vars);
    case "heading":
      return interpolate(block.text, vars).toUpperCase();
    case "image":
      return block.alt ? `[Image: ${block.alt}]` : "";
    case "button":
      return `${interpolate(block.text, vars)} : ${interpolate(block.url, vars)}`;
    case "list": {
      const bullet = block.ordered ? null : "•";
      return block.items
        .map((it, i) => `${bullet ?? `${i + 1}.`} ${interpolate(it, vars)}`)
        .join("\n");
    }
    case "callout": {
      const title = block.title ? `[${interpolate(block.title, vars)}] ` : "";
      return `${title}${interpolate(block.text, vars)}`;
    }
    case "divider":
      return "─────────";
    case "spacer":
      return "";
  }
}

function renderShellText(args: {
  brandName: string;
  contentText: string;
  footerText: string;
}): string {
  return `${args.brandName}
================

${args.contentText}

---
${args.footerText}`;
}

// ============================================================
// API publique
// ============================================================

export type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
};

export function renderEmail(
  template: EmailTemplate,
  vars: EmailVariables,
): RenderedEmail {
  const accent = template.accent_color || "#1d4ed8";

  const contentHtml = template.body
    .map((b) => renderBlockHtml(b, vars, accent))
    .join("\n");

  const contentText = template.body
    .map((b) => renderBlockText(b, vars))
    .filter((s) => s.length > 0)
    .join("\n\n");

  const html = renderShellHtml({
    brandName: template.header_brand_name,
    brandTagline: template.header_brand_tagline,
    logoUrl: template.header_logo_url,
    footerText: interpolate(template.footer_text, vars),
    contentHtml,
  });

  const text = renderShellText({
    brandName: template.header_brand_name,
    contentText,
    footerText: interpolate(template.footer_text, vars),
  });

  return {
    subject: interpolate(template.subject, vars),
    html,
    text,
  };
}
