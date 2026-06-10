import Link from 'next/link';
import { Atmosphere } from '@/features/landing/components/Atmosphere';

/**
 * CTA final — frame noir immersif full-bleed, statement monumental,
 * pill paper-white, grain + atmosphère. Dernière rupture avant le footer.
 */
export function CTASection() {
  return (
    <section className="grain relative overflow-hidden bg-ink-black text-paper-white">
      <Atmosphere />
      <div className="relative flex flex-col items-center px-6 py-32 text-center md:px-12 md:py-48">
        <h2
          data-reveal
          className="max-w-[16ch] text-[clamp(2.5rem,8vw,120px)] font-light leading-[0.95] tracking-[-0.02em]"
        >
          Ouvre le terminal.
        </h2>
        <p
          data-reveal
          className="mt-8 max-w-md text-[18px] font-light leading-normal text-smoke"
        >
          Rejoins les traders qui lisent la chaîne au lieu de la subir.
        </p>
        <div data-reveal className="mt-12 flex flex-wrap items-center justify-center gap-5">
          <Link
            href="/sign-up"
            className="rounded-pill bg-paper-white px-10 py-4 text-[15px] font-normal text-ink-black transition-colors hover:bg-smoke"
          >
            Commencer gratuitement
          </Link>
          <Link
            href="/sign-in"
            className="rounded-pill border border-smoke/50 px-10 py-4 text-[15px] font-normal text-paper-white transition-colors hover:border-paper-white"
          >
            J’ai déjà un compte
          </Link>
        </div>
      </div>
    </section>
  );
}
