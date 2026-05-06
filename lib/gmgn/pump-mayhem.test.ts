import { describe, expect, it } from 'vitest';
import { gmgnPayloadIndicatesPumpMayhem } from '@/lib/gmgn/pump-mayhem';

describe('gmgnPayloadIndicatesPumpMayhem', () => {
  it('returns true for launchpad_platform pump_mayhem', () => {
    expect(
      gmgnPayloadIndicatesPumpMayhem({
        name: 'foo',
        launchpad_platform: 'pump_mayhem',
      })
    ).toBe(true);
  });

  it('returns true for nested launchpad_platform pump_mayhem_agent', () => {
    expect(
      gmgnPayloadIndicatesPumpMayhem({
        data: { launchpad_platform: 'pump_mayhem_agent' },
      })
    ).toBe(true);
  });

  it('returns false when only name contains mayhem substring', () => {
    expect(
      gmgnPayloadIndicatesPumpMayhem({
        name: 'mayhem coin',
        launchpad: 'pump',
      })
    ).toBe(false);
  });

  it('returns false for unrelated platform', () => {
    expect(
      gmgnPayloadIndicatesPumpMayhem({
        launchpad_platform: 'Pump.fun',
        pool: { exchange: 'raydium' },
      })
    ).toBe(false);
  });
});
