import { describe, expect, it } from 'vitest';
import {
  gmgnPayloadIndicatesPumpfunMint,
  isPumpfunLaunchpadValue,
} from '@/lib/gmgn/pumpfun-mint';

describe('isPumpfunLaunchpadValue', () => {
  it('accepte pump.fun et pump', () => {
    expect(isPumpfunLaunchpadValue('Pump.fun')).toBe(true);
    expect(isPumpfunLaunchpadValue('pump')).toBe(true);
    expect(isPumpfunLaunchpadValue('pump_mayhem')).toBe(true);
  });

  it('rejette Meteora et Raydium', () => {
    expect(isPumpfunLaunchpadValue('meteora_virtual_curve')).toBe(false);
    expect(isPumpfunLaunchpadValue('raydium')).toBe(false);
  });
});

describe('gmgnPayloadIndicatesPumpfunMint', () => {
  it('détecte launchpad_platform pump via GMGN', () => {
    expect(
      gmgnPayloadIndicatesPumpfunMint({
        launchpad_platform: 'pump',
        symbol: 'FOO',
      })
    ).toBe(true);
  });

  it('rejette meteora_virtual_curve (ex. ULTRASUIT / WAVR)', () => {
    expect(
      gmgnPayloadIndicatesPumpfunMint({
        launchpad: 'meteora_virtual_curve',
        launchpad_platform: 'meteora_virtual_curve',
        name: 'wavr.fun',
      })
    ).toBe(false);
  });
});
