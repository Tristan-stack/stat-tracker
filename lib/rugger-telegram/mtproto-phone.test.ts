import { describe, expect, it } from 'vitest';
import { composeE164FromIsoAndNational, normalizePhoneE164 } from './mtproto-phone';

describe('composeE164FromIsoAndNational', () => {
  it('compose France mobile sans 0 initial', () => {
    expect(composeE164FromIsoAndNational('FR', '612345678')).toBe('+33612345678');
  });

  it('compose France avec 0 troncature', () => {
    expect(composeE164FromIsoAndNational('FR', '06 12 34 56 78')).toBe('+33612345678');
  });

  it('accepte collage E.164 complet dans le champ national', () => {
    expect(composeE164FromIsoAndNational('FR', '+32 470 12 34 56')).toBe(
      normalizePhoneE164('+32470123456')
    );
  });
});
