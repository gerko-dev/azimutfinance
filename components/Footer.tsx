import Link from "next/link";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-slate-900 text-slate-300 mt-12">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-10 md:py-14">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-8">
          {/* Brand block */}
          <div className="col-span-2 md:col-span-2">
            <Link href="/" className="text-lg font-semibold tracking-tight">
              <span className="text-blue-400">Azimut</span>
              <span className="text-white">Finance</span>
            </Link>
            <p className="text-sm text-slate-400 mt-3 leading-relaxed max-w-xs">
              Le portail des marchés financiers de l&apos;UEMOA : actions, obligations,
              macroéconomie, formation et communauté.
            </p>
            <div className="flex gap-3 mt-5">
              <SocialLink href="https://x.com" label="X / Twitter">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </SocialLink>
              <SocialLink href="https://linkedin.com" label="LinkedIn">
                <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
              </SocialLink>
              <SocialLink href="https://youtube.com" label="YouTube">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
              </SocialLink>
            </div>
          </div>

          {/* Marchés */}
          <Column title="Marchés">
            <Item href="/marches/actions">Actions BRVM</Item>
            <Item href="/marches/obligations">Obligations cotées</Item>
            <Item href="/marches/souverains-non-cotes">Souverains UMOA-Titres</Item>
            <Item href="/marches/fcp">FCP / OPCVM</Item>
            <Item href="/marche-monetaire">Marché monétaire</Item>
          </Column>

          {/* Macro & Outils */}
          <Column title="Macro &amp; outils">
            <Item href="/macro/pays">Pays UEMOA</Item>
            <Item href="/macro/matieres-premieres">Matières premières</Item>
            <Item href="/macro/devises">Devises &amp; FX</Item>
            <Item href="/macro/immobilier">Immobilier</Item>
            <Item href="/outils/ytm">Calculateur YTM</Item>
          </Column>

          {/* Académie */}
          <Column title="Académie">
            <Item href="/academie/formations">Formations</Item>
            <Item href="/academie/glossaire">Glossaire</Item>
            <Item href="/academie/magazine">Magazine</Item>
            <Item href="/academie/simulateur">Simulateur</Item>
            <Item href="/communaute/newsletter">Newsletter</Item>
          </Column>

          {/* Compte / Légal */}
          <Column title="Compte">
            <Item href="/compte">Mon compte</Item>
            <Item href="/messagerie">Messagerie</Item>
            <Item href="/connexion">Connexion</Item>
            <Item href="/inscription">S&apos;inscrire</Item>
            <Item href="/pros">Espace Pros</Item>
          </Column>
        </div>

        <div className="mt-10 pt-6 border-t border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-400">
          <div>© {year} AzimutFinance. Tous droits réservés.</div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Link href="/legal/mentions" className="hover:text-white">Mentions légales</Link>
            <Link href="/legal/cgu" className="hover:text-white">CGU</Link>
            <Link href="/legal/confidentialite" className="hover:text-white">Confidentialité</Link>
            <Link href="/legal/cookies" className="hover:text-white">Cookies</Link>
          </div>
        </div>

        <p className="mt-6 text-[10px] text-slate-500 leading-relaxed max-w-3xl">
          Avertissement : AzimutFinance fournit des données et analyses à titre informatif.
          Aucune information publiée ne constitue une recommandation d&apos;investissement.
          Investir comporte un risque de perte en capital. Les performances passées ne préjugent
          pas des performances futures.
        </p>
      </div>
    </footer>
  );
}

function Column({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-xs font-semibold text-white uppercase tracking-wider mb-3">
        {title}
      </div>
      <ul className="space-y-2 text-sm">{children}</ul>
    </div>
  );
}

function Item({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="text-slate-400 hover:text-white transition">
        {children}
      </Link>
    </li>
  );
}

function SocialLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="w-9 h-9 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 hover:text-white transition"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        {children}
      </svg>
    </a>
  );
}
