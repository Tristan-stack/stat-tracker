'use client';

import { useEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

/**
 * Orchestrateur d'animations de la landing (GSAP). Cible des attributs data-*
 * pour laisser les sections en server components :
 * - [data-hero-line]  : lignes du titre hero, révélées par masque (entrée)
 * - [data-hero-fade]  : éléments secondaires du hero, fondu décalé (entrée)
 * - [data-blob]       : nappes d'atmosphère, dérive organique continue
 * - [data-reveal]     : sections/cellules, fade-up déclenché au scroll
 * Respecte prefers-reduced-motion (aucune animation, tout reste visible).
 */
export function LandingFx() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      // Entrée hero : les lignes du statement montent derrière leur masque
      gsap.from('[data-hero-line]', {
        yPercent: 115,
        duration: 1.2,
        ease: 'power4.out',
        stagger: 0.14,
        delay: 0.2,
      });
      gsap.from('[data-hero-fade]', {
        opacity: 0,
        y: 24,
        duration: 0.9,
        ease: 'power2.out',
        stagger: 0.12,
        delay: 0.85,
      });

      // Dérive organique des nappes d'atmosphère (boucle lente, yoyo)
      gsap.utils.toArray<HTMLElement>('[data-blob]').forEach((el, i) => {
        gsap.to(el, {
          xPercent: gsap.utils.random(-22, 22),
          yPercent: gsap.utils.random(-16, 16),
          scale: gsap.utils.random(0.85, 1.25),
          rotation: gsap.utils.random(-30, 30),
          duration: gsap.utils.random(8, 14),
          ease: 'sine.inOut',
          repeat: -1,
          yoyo: true,
          delay: i * 0.8,
        });
      });

      // Reveals au scroll : fade-up discret, une fois
      gsap.utils.toArray<HTMLElement>('[data-reveal]').forEach((el) => {
        gsap.from(el, {
          opacity: 0,
          y: 40,
          duration: 0.9,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: el,
            start: 'top 86%',
            once: true,
          },
        });
      });
    });

    return () => ctx.revert();
  }, []);

  return null;
}
