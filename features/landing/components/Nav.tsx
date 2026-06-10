'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

const NAV_LINKS = [
  { href: '#capabilities', label: 'PRODUIT' },
  { href: '#how', label: 'MÉTHODE' },
  { href: '#manifesto', label: 'MANIFESTE' },
];

/**
 * Nav flottante monopo : transparente sur le hero noir (texte paper),
 * bascule en blanc + texte ink au scroll. Aucun fond/ombre par défaut.
 */
export function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-colors duration-300',
        scrolled
          ? 'border-b border-border bg-paper-white text-ink-black'
          : 'border-b border-transparent bg-transparent text-paper-white'
      )}
    >
      <div className="flex h-16 items-center justify-between px-6 md:px-12">
        <Link href="/" className="text-[12px] font-normal tracking-[0.18em]">
          STATTRACKER
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-[12px] font-normal tracking-[0.14em] opacity-70 transition-opacity hover:opacity-100"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-5">
          <Link
            href="/sign-in"
            className="text-[12px] font-normal tracking-[0.14em] opacity-70 transition-opacity hover:opacity-100"
          >
            CONNEXION
          </Link>
          <Link
            href="/sign-up"
            className={cn(
              'rounded-pill px-5 py-1.5 text-[12px] font-normal tracking-[0.08em] transition-colors',
              scrolled
                ? 'bg-ink-black text-paper-white hover:bg-carbon'
                : 'bg-paper-white text-ink-black hover:bg-smoke'
            )}
          >
            Commencer
          </Link>
        </div>
      </div>
    </header>
  );
}
