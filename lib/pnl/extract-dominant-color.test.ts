import { describe, expect, it } from 'vitest';
import {
  buildDominantColor,
  luminance,
  mixHex,
  pickTextColor,
  rgbToHex,
} from '@/lib/pnl/extract-dominant-color';

describe('helpers couleur', () => {
  it('rgbToHex clamp et formate', () => {
    expect(rgbToHex(255, 0, 0)).toBe('#ff0000');
    expect(rgbToHex(300, -5, 16)).toBe('#ff0010');
  });

  it('luminance : blanc > noir', () => {
    expect(luminance('#ffffff')).toBeCloseTo(255);
    expect(luminance('#000000')).toBe(0);
  });

  it('pickTextColor : blanc sur fond foncé, noir sur fond clair', () => {
    expect(pickTextColor('#101010')).toBe('#ffffff');
    expect(pickTextColor('#f5a623')).toBe('#000000');
    expect(pickTextColor('#ffffff')).toBe('#000000');
  });

  it('mixHex interpole', () => {
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mixHex('#000000', '#ffffff', 0)).toBe('#000000');
    expect(mixHex('#ff0000', '#0000ff', 1)).toBe('#0000ff');
  });

  it('buildDominantColor : fond foncé → texte blanc, panel nuancé', () => {
    const dc = buildDominantColor('#1a2b3c');
    expect(dc.base).toBe('#1a2b3c');
    expect(dc.isDark).toBe(true);
    expect(dc.textColor).toBe('#ffffff');
    expect(dc.panel).not.toBe(dc.base);
    expect(dc.border).not.toBe(dc.base);
  });

  it('buildDominantColor : fond clair → texte noir', () => {
    const dc = buildDominantColor('#f97316');
    expect(dc.textColor).toBe('#000000');
    expect(dc.isDark).toBe(false);
  });
});
