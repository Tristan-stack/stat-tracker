import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Atmosphere } from '@/features/landing/components/Atmosphere';
import type { LandingFeature } from '@/features/landing/data';

/**
 * Bande éditoriale 2 colonnes full-bleed (texte + frame atmosphérique sombre).
 * Hairlines bord à bord, zéro ombre. `reversed` alterne le sens.
 */
export function FeatureBand({
  feature,
  reversed = false,
}: {
  feature: LandingFeature;
  reversed?: boolean;
}) {
  const Icon = feature.icon;

  return (
    <section className="border-b border-border bg-paper-white">
      <div className="grid items-stretch md:grid-cols-2">
        {/* Texte */}
        <div
          data-reveal
          className={cn(
            'flex flex-col justify-center px-6 py-20 md:px-12 md:py-32',
            reversed && 'md:order-2 md:border-l md:border-border'
          )}
        >
          <div className="flex items-center gap-4 text-ash">
            <span className="text-[12px] tracking-[0.2em] tabular-nums">
              {feature.index}
            </span>
            <span className="h-px w-10 bg-ash/50" />
            <Icon className="size-4" strokeWidth={1.5} />
          </div>

          <h2 className="mt-8 max-w-[14ch] text-[clamp(2rem,5vw,54px)] font-light leading-[1.05] tracking-[-0.01em] text-ink-black">
            {feature.title}
          </h2>
          <p className="mt-4 text-[18px] font-normal italic text-ash">
            {feature.tagline}
          </p>

          <p className="mt-8 max-w-md text-[18px] font-light leading-normal text-carbon">
            {feature.description}
          </p>

          {feature.points.length > 0 && (
            <ul className="mt-10 space-y-4">
              {feature.points.map((point) => (
                <li
                  key={point}
                  className="flex items-start gap-3 text-[15px] font-normal text-carbon"
                >
                  <Check className="mt-0.5 size-4 shrink-0 text-ink-black" strokeWidth={1.5} />
                  {point}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Frame atmosphérique — noir immersif, grain + nappes organiques */}
        <div
          data-reveal
          className={cn(
            'grain relative min-h-[320px] overflow-hidden bg-ink-black md:min-h-0',
            reversed && 'md:order-1'
          )}
        >
          <Atmosphere className="opacity-80" />
          <div className="relative flex h-full items-center justify-center p-12">
            <Icon
              className="size-24 text-paper-white/90 md:size-32"
              strokeWidth={0.75}
            />
            <span className="absolute bottom-8 left-8 text-[120px] font-light leading-none text-paper-white/25 tabular-nums md:text-[180px]">
              {feature.index}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
