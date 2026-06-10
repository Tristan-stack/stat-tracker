import Link from 'next/link';

/** Footer carbon — texte muet, hairline, ghost links. */
export function Footer() {
  return (
    <footer className="bg-paper-white">
      <div className="px-6 md:px-12">
        <div className="flex flex-col gap-10 border-t border-border py-16 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-[12px] tracking-[0.18em] text-ink-black">
              STATTRACKER
            </p>
            <p className="mt-4 max-w-xs text-[13px] font-light leading-normal text-ash">
              Terminal d’analyse on-chain pour traders Solana.
              La donnée brute, rendue lisible.
            </p>
          </div>

          <nav className="flex flex-wrap gap-x-12 gap-y-6">
            <div className="flex flex-col gap-3">
              <span className="text-[11px] uppercase tracking-[0.2em] text-ash">
                Produit
              </span>
              <Link href="/sign-up" className="text-[13px] text-carbon hover:text-ink-black">
                Commencer
              </Link>
              <Link href="/sign-in" className="text-[13px] text-carbon hover:text-ink-black">
                Connexion
              </Link>
              <a href="#capabilities" className="text-[13px] text-carbon hover:text-ink-black">
                Modules
              </a>
            </div>
            <div className="flex flex-col gap-3">
              <span className="text-[11px] uppercase tracking-[0.2em] text-ash">
                En savoir plus
              </span>
              <a href="#how" className="text-[13px] text-carbon hover:text-ink-black">
                Méthode
              </a>
              <a href="#manifesto" className="text-[13px] text-carbon hover:text-ink-black">
                Manifeste
              </a>
            </div>
          </nav>
        </div>

        <div className="flex flex-col gap-2 border-t border-border py-8 text-[11px] text-ash md:flex-row md:items-center md:justify-between">
          <span>© {new Date().getFullYear()} StatTracker</span>
          <span className="tracking-widest">Built on Solana · Achromatic by design</span>
        </div>
      </div>
    </footer>
  );
}
