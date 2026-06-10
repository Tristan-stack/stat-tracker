import { Atmosphere } from '@/features/landing/components/Atmosphere';

/**
 * Frame noir immersif — rupture cinématique entre les bandes blanches.
 * Pull-quote / manifeste, type monumentale Inter 300, grain + atmosphère.
 */
export function ImmersiveFrame() {
  return (
    <section
      id="manifesto"
      className="grain relative overflow-hidden bg-ink-black text-paper-white"
    >
      <Atmosphere />
      <div className="relative px-6 py-32 md:px-12 md:py-48">
        <p data-reveal className="mb-10 text-[12px] uppercase tracking-[0.32em] text-smoke">
          Manifeste
        </p>
        <blockquote
          data-reveal
          className="max-w-[18ch] text-[clamp(2.25rem,7vw,94px)] font-light leading-[1.05] tracking-[-0.02em]"
        >
          La chaîne dit tout.
          <br />
          Encore faut-il
          <br />
          savoir lire.
        </blockquote>
        <p
          data-reveal
          className="mt-12 max-w-lg text-[18px] font-light leading-normal text-smoke"
        >
          Pas de signaux magiques, pas de promesses. Juste la donnée on-chain,
          rendue lisible — pour décider avec la tête, pas avec le bruit.
        </p>
      </div>
    </section>
  );
}
