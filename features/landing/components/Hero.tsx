import Link from 'next/link';
import { HeroBeams } from '@/features/landing/components/HeroBeams';

/**
 * Hero monopo : frame noir full-bleed, statement monumental Inter 300,
 * grain film + faisceaux WebGL monochromes (react-bits Beams) en background.
 * Chaque ligne du titre est masquée (overflow-hidden) pour la révélation GSAP.
 */
export function Hero() {
  return (
    <section className="grain relative flex min-h-screen items-center overflow-hidden bg-ink-black text-paper-white">
      <HeroBeams />
      {/* Voile de lisibilité : scrim léger côté texte + assise en bas */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-ink-black/70 via-ink-black/25 to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-ink-black/80 to-transparent"
      />

      <div className="relative w-full px-6 pt-28 md:px-12">
        <p
          data-hero-fade
          className="mb-8 text-[12px] font-normal uppercase tracking-[0.32em] text-smoke"
        >
          Terminal d’analyse on-chain · Solana
        </p>

        <h1 className="max-w-[14ch] text-[clamp(2.75rem,11vw,170px)] font-light leading-[0.82] tracking-[-0.02em]">
          <span className="block overflow-hidden">
            <span data-hero-line className="block pb-[0.12em] -mb-[0.12em]">
              Vois ce que
            </span>
          </span>
          <span className="block overflow-hidden">
            <span data-hero-line className="block pb-[0.12em] -mb-[0.12em]">
              les autres ratent.
            </span>
          </span>
        </h1>

        <p
          data-hero-fade
          className="mt-10 max-w-xl text-[18px] font-light leading-normal text-smoke"
        >
          StatTracker traque les ruggers, cartographie les réseaux de wallets
          et mesure ton PnL réel. Toute la donnée Solana — sans le bruit.
        </p>

        <div data-hero-fade className="mt-12 flex flex-wrap items-center gap-5">
          <Link
            href="/sign-up"
            className="rounded-pill bg-paper-white px-8 py-3 text-[14px] font-normal text-ink-black transition-colors hover:bg-smoke"
          >
            Ouvrir le terminal
          </Link>
          <Link
            href="#capabilities"
            className="rounded-pill border border-smoke/50 px-8 py-3 text-[14px] font-normal text-paper-white transition-colors hover:border-paper-white"
          >
            Explorer les modules
          </Link>
        </div>
      </div>

      <span
        data-hero-fade
        className="absolute bottom-8 left-6 text-[9px] uppercase tracking-[0.3em] text-smoke md:left-12"
      >
        Scroll to explore
      </span>
    </section>
  );
}
