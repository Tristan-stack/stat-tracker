'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Atmosphere } from '@/features/landing/components/Atmosphere';

/**
 * Background WebGL du hero : faisceaux monochromes (react-bits Beams).
 * Chargé en lazy côté client uniquement — three.js ne doit peser ni sur le SSR
 * ni sur le bundle initial. Fallback statique (Atmosphere) si reduced-motion.
 */
const Beams = dynamic(() => import('@/features/landing/components/Beams'), {
  ssr: false,
});

export function HeroBeams() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  if (reducedMotion) return <Atmosphere />;

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <Beams
        beamWidth={4}
        beamHeight={17}
        beamNumber={12}
        lightColor="#ffffff"
        speed={3.6}
        noiseIntensity={5}
        scale={0.15}
        rotation={-35}
      />
    </div>
  );
}
