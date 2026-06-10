import { LANDING_STATS } from '@/features/landing/data';

/**
 * Bande de chiffres achromatiques (tabular-nums), full-bleed : les hairlines
 * courent d'un bord à l'autre du viewport. Zéro couleur, zéro ombre.
 */
export function StatStrip() {
  return (
    <section className="border-y border-border bg-paper-white">
      <div className="grid grid-cols-2 md:grid-cols-4">
        {LANDING_STATS.map((stat, i) => (
          <div
            key={stat.label}
            data-reveal
            className={`px-6 py-12 md:px-12 md:py-16 ${
              i !== 0 ? 'border-l border-border' : ''
            } ${i === 2 ? 'border-l-0 md:border-l' : ''}`}
          >
            <div className="text-[clamp(2.5rem,5vw,64px)] font-light leading-none tracking-[-0.02em] text-ink-black tabular-nums">
              {stat.value}
            </div>
            <div className="mt-4 text-[13px] font-normal leading-snug text-ash">
              {stat.label}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
