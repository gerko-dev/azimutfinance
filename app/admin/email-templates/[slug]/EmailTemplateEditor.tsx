"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import type { EmailTemplate } from "@/lib/email/blocks";
import { renderEmail } from "@/lib/email/render";
import EmailBlocksField from "./EmailBlocksField";
import {
  saveEmailTemplateAction,
  sendTestEmailAction,
  uploadEmailImageAction,
} from "../actions";

type Variable = { label: string; sample: string };

type Props = {
  template: EmailTemplate;
  variables: Variable[];
};

export default function EmailTemplateEditor({ template, variables }: Props) {
  const [state, setState] = useState<EmailTemplate>(template);
  const [baseline, setBaseline] = useState<EmailTemplate>(template);
  const [saving, startSave] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [testEmail, setTestEmail] = useState("");
  const [testOpen, setTestOpen] = useState(false);
  const [sending, startSend] = useTransition();
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState(false);

  const [previewMode, setPreviewMode] = useState<"html" | "text">("html");

  const dirty = useMemo(
    () => JSON.stringify(state) !== JSON.stringify(baseline),
    [state, baseline],
  );

  // Variables d'exemple injectees dans l'apercu live
  const sampleVars = useMemo(() => {
    const v: Record<string, string> = {};
    for (const x of variables) v[x.label] = x.sample;
    return v;
  }, [variables]);

  const rendered = useMemo(
    () => renderEmail(state, sampleVars),
    [state, sampleVars],
  );

  function patch(p: Partial<EmailTemplate>) {
    setState((s) => ({ ...s, ...p }));
    setSaveSuccess(false);
  }

  function handleSave() {
    setSaveError(null);
    setSaveSuccess(false);
    const fd = new FormData();
    fd.set("slug", state.slug);
    fd.set("subject", state.subject);
    fd.set("header_brand_name", state.header_brand_name);
    fd.set("header_brand_tagline", state.header_brand_tagline);
    fd.set("header_logo_url", state.header_logo_url ?? "");
    fd.set("footer_text", state.footer_text);
    fd.set("accent_color", state.accent_color);
    fd.set("body", JSON.stringify(state.body));
    startSave(async () => {
      const res = await saveEmailTemplateAction(fd);
      if (res.ok) {
        setBaseline(state);
        setSaveSuccess(true);
      } else {
        setSaveError(res.error);
      }
    });
  }

  function handleSendTest() {
    setSendError(null);
    setSendSuccess(false);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmail.trim())) {
      setSendError("Email invalide.");
      return;
    }
    const fd = new FormData();
    fd.set("to", testEmail.trim());
    fd.set("template", JSON.stringify(state));
    startSend(async () => {
      const res = await sendTestEmailAction(fd);
      if (res.ok) {
        setSendSuccess(true);
      } else {
        setSendError(res.error);
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="sticky top-0 z-10 -mx-4 px-4 py-3 bg-white border border-slate-200 rounded-lg flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold text-slate-900 truncate">
            {state.slug}
          </span>
          {dirty && (
            <span className="text-[10px] uppercase font-semibold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
              Modifications non sauvegardées
            </span>
          )}
          {!dirty && saveSuccess && (
            <span className="text-[10px] uppercase font-semibold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">
              ✓ Sauvegardé
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setTestOpen(true)}
            className="text-xs px-3 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-medium"
          >
            ✉️ Envoyer un test
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !dirty}
            className="text-xs px-3 py-1.5 rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Sauvegarde…" : "Enregistrer"}
          </button>
        </div>
      </div>

      {saveError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {saveError}
        </div>
      )}

      {/* Test send dialog (inline) */}
      {testOpen && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">
              Envoyer un email de test
            </h3>
            <button
              type="button"
              onClick={() => {
                setTestOpen(false);
                setSendError(null);
                setSendSuccess(false);
              }}
              className="text-xs text-slate-500 hover:text-slate-900"
            >
              Fermer
            </button>
          </div>
          <p className="text-xs text-slate-500">
            Envoie le rendu de l&apos;état <strong>actuel</strong> (non
            sauvegardé) avec des variables d&apos;exemple. Le sujet sera
            préfixé par <code>[TEST]</code>.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="ton-email@example.com"
              className="flex-1 min-w-[200px] text-sm border border-slate-300 rounded px-3 py-2 bg-white"
            />
            <button
              type="button"
              onClick={handleSendTest}
              disabled={sending}
              className="text-xs px-3 py-2 rounded-md bg-slate-900 text-white font-medium hover:bg-slate-800 disabled:opacity-50"
            >
              {sending ? "Envoi…" : "Envoyer"}
            </button>
          </div>
          {sendError && (
            <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2">
              {sendError}
            </div>
          )}
          {sendSuccess && (
            <div className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded px-3 py-2">
              ✓ Email envoyé.
            </div>
          )}
        </div>
      )}

      {/* Two-column layout : form / preview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Form */}
        <div className="space-y-5">
          {/* Sujet */}
          <Section title="Sujet de l'email">
            <input
              type="text"
              value={state.subject}
              onChange={(e) => patch({ subject: e.target.value })}
              className="w-full text-sm border border-slate-300 rounded px-3 py-2 bg-white"
              placeholder="Sujet (utilise {{full_name}}, etc.)"
            />
          </Section>

          {/* Branding */}
          <Section title="En-tête (header)">
            <div className="space-y-3">
              <div>
                <Label>Nom de la marque</Label>
                <input
                  type="text"
                  value={state.header_brand_name}
                  onChange={(e) => patch({ header_brand_name: e.target.value })}
                  className="w-full text-sm border border-slate-300 rounded px-3 py-2 bg-white"
                />
              </div>
              <div>
                <Label>Tagline (sous le nom si pas de logo)</Label>
                <input
                  type="text"
                  value={state.header_brand_tagline}
                  onChange={(e) => patch({ header_brand_tagline: e.target.value })}
                  className="w-full text-sm border border-slate-300 rounded px-3 py-2 bg-white"
                />
              </div>
              <div>
                <Label>Logo (remplace le texte si renseigné)</Label>
                <LogoUploadField
                  slug={state.slug}
                  url={state.header_logo_url}
                  onChange={(url) => patch({ header_logo_url: url })}
                />
              </div>
              <div>
                <Label>Couleur d&apos;accent (boutons CTA par défaut)</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={state.accent_color}
                    onChange={(e) => patch({ accent_color: e.target.value })}
                    className="w-12 h-9 border border-slate-300 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={state.accent_color}
                    onChange={(e) => patch({ accent_color: e.target.value })}
                    className="text-sm border border-slate-300 rounded px-2 py-1.5 bg-white font-mono w-28"
                    placeholder="#1d4ed8"
                  />
                </div>
              </div>
            </div>
          </Section>

          {/* Body */}
          <Section title="Corps du message">
            <EmailBlocksField
              slug={state.slug}
              value={state.body}
              onChange={(body) => patch({ body })}
            />
          </Section>

          {/* Footer */}
          <Section title="Pied de page (footer)">
            <textarea
              value={state.footer_text}
              onChange={(e) => patch({ footer_text: e.target.value })}
              rows={3}
              className="w-full text-sm border border-slate-300 rounded px-3 py-2 bg-white"
              placeholder="Texte du pied de page"
            />
          </Section>

          {/* Variables hints */}
          <Section title="Variables disponibles">
            <p className="text-xs text-slate-500 mb-2">
              Insère ces marqueurs dans le sujet ou n&apos;importe quel bloc de
              texte. Ils seront remplacés à l&apos;envoi.
            </p>
            <ul className="space-y-1">
              {variables.map((v) => (
                <li key={v.label} className="text-xs flex items-baseline gap-2">
                  <code className="font-mono bg-slate-100 text-slate-900 px-1.5 py-0.5 rounded border border-slate-200">{`{{${v.label}}}`}</code>
                  <span className="text-slate-500">→ ex. {v.sample}</span>
                </li>
              ))}
            </ul>
          </Section>
        </div>

        {/* Preview */}
        <div className="space-y-3 lg:sticky lg:top-20 lg:self-start">
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="border-b border-slate-200 px-4 py-2.5 flex items-center justify-between">
              <div className="text-xs">
                <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                  Aperçu — sujet
                </div>
                <div className="text-sm font-medium text-slate-900 truncate">
                  {rendered.subject || "(sujet vide)"}
                </div>
              </div>
              <div className="flex items-center gap-0.5 bg-slate-100 rounded p-0.5">
                <button
                  type="button"
                  onClick={() => setPreviewMode("html")}
                  className={`text-[11px] px-2 py-1 rounded ${previewMode === "html" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}
                >
                  HTML
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewMode("text")}
                  className={`text-[11px] px-2 py-1 rounded ${previewMode === "text" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}
                >
                  Texte
                </button>
              </div>
            </div>

            {previewMode === "html" ? (
              <iframe
                srcDoc={rendered.html}
                title="Aperçu email"
                sandbox=""
                className="w-full h-[700px] bg-white"
              />
            ) : (
              <pre className="w-full h-[700px] overflow-auto bg-slate-900 text-slate-100 p-4 text-xs whitespace-pre-wrap font-mono leading-relaxed">
{rendered.text}
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <h2 className="text-sm font-semibold text-slate-900 mb-3">{title}</h2>
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">
      {children}
    </div>
  );
}

function LogoUploadField({
  slug,
  url,
  onChange,
}: {
  slug: string;
  url: string | null;
  onChange: (url: string | null) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("slug", `logos/${slug}`);
    startTransition(async () => {
      const res = await uploadEmailImageAction(fd);
      if (res.ok) onChange(res.data.url);
      else setError(res.error);
      if (fileInputRef.current) fileInputRef.current.value = "";
    });
  }

  return (
    <div className="space-y-2">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        onChange={onFileChange}
        className="hidden"
      />
      {url ? (
        <div className="flex items-center gap-3 border border-slate-200 rounded p-2 bg-slate-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="Logo" className="h-10 w-auto bg-white rounded p-1" />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-xs text-rose-700 hover:underline ml-auto"
          >
            Retirer
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isPending}
          className="w-full text-xs border-2 border-dashed border-slate-300 rounded px-3 py-3 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-50"
        >
          {isPending ? "Téléversement…" : "📷 Téléverser un logo (PNG/SVG, max 5 Mo)"}
        </button>
      )}
      {error && (
        <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1">
          {error}
        </div>
      )}
      <input
        type="text"
        value={url ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        placeholder="URL du logo (ou téléverser ci-dessus)"
        className="w-full text-xs border border-slate-300 rounded px-2 py-1.5 bg-white font-mono"
      />
    </div>
  );
}
