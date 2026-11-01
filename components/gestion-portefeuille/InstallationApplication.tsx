"use client";

// === Installer le module comme application ================================
//
// DEUX GESTES, ET LE NAVIGATEUR NE LES FAIT PAS SEUL. Il faut enregistrer le
// service worker — sans lui, Chrome et Edge ne proposent jamais l'installation
// — puis offrir un bouton : la banniere native n'apparait qu'apres plusieurs
// visites, a un moment que personne ne choisit.
//
// LE BOUTON NE S'AFFICHE QUE QUAND L'INSTALLATION EST POSSIBLE. Un bouton
// « Installer » qui ne fait rien parce que l'application l'est deja, ou parce
// que le navigateur ne sait pas le faire, vaut moins que pas de bouton.

import { useEffect, useState } from "react";

/** L'evenement que Chrome et Edge emettent quand l'installation est possible.
 *  Il n'est pas dans les types standard : il n'appartient a aucune norme. */
type EvenementInstallation = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/** Sommes-nous deja dans la fenetre de l'application ? */
function dejaInstallee(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari sur iOS, qui n'implemente pas `display-mode`.
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

export default function InstallationApplication() {
  const [invite, setInvite] = useState<EvenementInstallation | null>(null);
  // CALCULE A L'INITIALISATION, et non dans un effet : l'etat ne depend que du
  // mode d'affichage, qui est connu des le premier rendu.
  const [installee, setInstallee] = useState(dejaInstallee);

  useEffect(() => {
    // LA PORTEE EST CELLE DU MODULE, et elle est donnee par l'en-tete
    // `Service-Worker-Allowed` : le fichier est servi depuis la racine, mais
    // il ne doit gouverner que /gestion-portefeuille.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/gestion-portefeuille-sw.js", { scope: "/gestion-portefeuille" })
        .catch(() => {
          // Un enregistrement qui echoue n'empeche pas de travailler : on perd
          // l'installation, pas le module. Inutile d'alarmer le gerant.
        });
    }

    const surInvite = (e: Event) => {
      // Sans cela, le navigateur affiche sa propre banniere, au moment qui lui
      // plait, en bas de l'ecran.
      e.preventDefault();
      setInvite(e as EvenementInstallation);
    };
    const surInstallation = () => {
      setInstallee(true);
      setInvite(null);
    };

    window.addEventListener("beforeinstallprompt", surInvite);
    window.addEventListener("appinstalled", surInstallation);
    return () => {
      window.removeEventListener("beforeinstallprompt", surInvite);
      window.removeEventListener("appinstalled", surInstallation);
    };
  }, []);

  if (installee || !invite) return null;

  return (
    <button
      type="button"
      onClick={async () => {
        await invite.prompt();
        const { outcome } = await invite.userChoice;
        // L'INVITE NE SERT QU'UNE FOIS : la garder afficherait un bouton qui
        // ne ferait plus rien au second clic.
        setInvite(null);
        if (outcome === "accepted") setInstallee(true);
      }}
      title="Ouvrir le module dans sa propre fenêtre, avec une icône au bureau"
      className="px-2.5 py-1 rounded text-[11px] font-medium border border-blue-300 text-blue-800 hover:bg-blue-50 transition whitespace-nowrap"
    >
      Installer l&apos;application
    </button>
  );
}
