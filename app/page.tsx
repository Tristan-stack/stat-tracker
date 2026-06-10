import { LandingFx } from '@/features/landing/components/LandingFx';
import { Nav } from '@/features/landing/components/Nav';
import { Hero } from '@/features/landing/components/Hero';
import { StatStrip } from '@/features/landing/components/StatStrip';
import { FeatureBand } from '@/features/landing/components/FeatureBand';
import { ImmersiveFrame } from '@/features/landing/components/ImmersiveFrame';
import { CapabilityGrid } from '@/features/landing/components/CapabilityGrid';
import { HowItWorks } from '@/features/landing/components/HowItWorks';
import { CTASection } from '@/features/landing/components/CTASection';
import { Footer } from '@/features/landing/components/Footer';
import { HEADLINE_FEATURES } from '@/features/landing/data';

export default function LandingPage() {
  return (
    <main className="bg-paper-white">
      <LandingFx />
      <Nav />
      <Hero />
      <StatStrip />
      <FeatureBand feature={HEADLINE_FEATURES[0]} />
      <ImmersiveFrame />
      <FeatureBand feature={HEADLINE_FEATURES[1]} reversed />
      <CapabilityGrid />
      <HowItWorks />
      <CTASection />
      <Footer />
    </main>
  );
}
