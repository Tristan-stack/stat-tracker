import { CAPABILITIES } from '@/features/landing/data';

/**
 * Grille éditoriale des capacités complémentaires, full-bleed : les hairlines
 * de la grille courent d'un bord à l'autre. Angles vifs, zéro ombre.
 */
export function CapabilityGrid() {
  return (
    <section id="capabilities" className="bg-paper-white">
      <div data-reveal className="px-6 pt-24 md:px-12 md:pt-32">
        <p className="text-[12px] uppercase tracking-[0.32em] text-ash">
          Le terminal complet
        </p>
        <h2 className="mt-6 max-w-[16ch] text-[clamp(2rem,5.5vw,78px)] font-light leading-[1.05] tracking-[-0.02em] text-ink-black">
          Sept modules. Une seule vue.
        </h2>
      </div>

      <div className="mt-16 grid border-t border-border md:grid-cols-3">
        {CAPABILITIES.map((feature, i) => {
          const Icon = feature.icon;
          return (
            <article
              key={feature.index}
              data-reveal
              className={`border-b border-border px-6 py-12 md:px-10 md:py-14 ${
                i % 3 !== 0 ? 'md:border-l md:border-border' : ''
              }`}
            >
              <div className="flex items-center justify-between text-ash">
                <Icon className="size-5" strokeWidth={1.5} />
                <span className="text-[12px] tracking-[0.2em] tabular-nums">
                  {feature.index}
                </span>
              </div>
              <h3 className="mt-10 text-[24px] font-light leading-tight text-ink-black">
                {feature.title}
              </h3>
              <p className="mt-1 text-[14px] font-normal italic text-ash">
                {feature.tagline}
              </p>
              <p className="mt-5 text-[15px] font-light leading-normal text-carbon">
                {feature.description}
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
