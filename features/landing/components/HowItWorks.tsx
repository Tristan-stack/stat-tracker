const STEPS = [
  {
    index: '01',
    title: 'Connecte la donnée',
    body: 'Importe tes wallets, tes tokens et tes channels. StatTracker agrège la donnée Solana brute en un seul endroit.',
  },
  {
    index: '02',
    title: 'Laisse le terminal lire',
    body: 'Réseaux de wallets, funding chains, historiques de ruggers, PnL : tout est croisé et rendu lisible automatiquement.',
  },
  {
    index: '03',
    title: 'Décide avec avance',
    body: 'Repère les patterns avant le marché, surveille les adresses qui comptent et agis sur du signal, pas du bruit.',
  },
];

/** Bande blanche éditoriale full-bleed — la méthode en trois temps. */
export function HowItWorks() {
  return (
    <section id="how" className="border-t border-border bg-paper-white">
      <div className="px-6 py-24 md:px-12 md:py-32">
        <div data-reveal>
          <p className="text-[12px] uppercase tracking-[0.32em] text-ash">
            La méthode
          </p>
          <h2 className="mt-6 max-w-[18ch] text-[clamp(2rem,5.5vw,78px)] font-light leading-[1.05] tracking-[-0.02em] text-ink-black">
            De la chaîne brute à la décision.
          </h2>
        </div>

        <div className="mt-20 grid gap-12 md:grid-cols-3 md:gap-px">
          {STEPS.map((step) => (
            <div key={step.index} data-reveal className="md:px-10 md:first:pl-0">
              <span className="text-[clamp(3rem,6vw,94px)] font-light leading-none text-smoke tabular-nums">
                {step.index}
              </span>
              <h3 className="mt-8 text-[24px] font-light text-ink-black">
                {step.title}
              </h3>
              <p className="mt-4 max-w-sm text-[16px] font-light leading-normal text-carbon">
                {step.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
