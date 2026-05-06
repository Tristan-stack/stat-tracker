import { describe, expect, it, vi, beforeEach } from 'vitest';
import { parsePnlMessage, tryParsePnlWithRegex } from '@/lib/telegram/parser';

vi.mock('@/lib/telegram/parser-gemini', () => ({
  extractPnlWithGemini: vi.fn(),
}));

import { extractPnlWithGemini } from '@/lib/telegram/parser-gemini';

const mockGemini = vi.mocked(extractPnlWithGemini);

beforeEach(() => {
  mockGemini.mockReset();
});

describe('tryParsePnlWithRegex', () => {
  it('extraits avec emojis après le montant sans « SOL » en fin', () => {
    const mint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    const txt = `CA: ${mint}
💎 Deployed 7.91 🚀
✅ Received 54.92
`;
    const parsed = tryParsePnlWithRegex(txt);
    expect(parsed.tokenMint).toBe(mint);
    expect(parsed.investedSol).toBeCloseTo(7.91);
    expect(parsed.soldSol).toBeCloseTo(54.92);
    expect(parsed.profitSol).toBeCloseTo(54.92 - 7.91);
  });

  it('mint depuis lien GMGN', () => {
    const mint = 'So11111111111111111111111111111111111111112';
    const txt = `Rug ✅\nVoir https://gmgn.ai/sol/token/${mint}\nDeploy 1 🔥\nReceived 11`;
    const parsed = tryParsePnlWithRegex(txt);
    expect(parsed.tokenMint).toBe(mint);
    expect(parsed.investedSol).toBeCloseTo(1);
    expect(parsed.soldSol).toBeCloseTo(11);
  });

  it('combine mint et montants SOL étiquettés', () => {
    const txt = `
**MEM**
Mint: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
Invested 2,5 SOL
Sell: 10 SOL
Profit +7.50 SOL (+300%)
`;
    const parsed = tryParsePnlWithRegex(txt);
    expect(parsed.tokenMint).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    expect(parsed.investedSol).toBeCloseTo(2.5);
    expect(parsed.soldSol).toBeCloseTo(10);
    expect(parsed.profitSol).toBeCloseTo(7.5);
    expect(parsed.profitPct).toBeCloseTo(300);
  });
});

describe('parsePnlMessage', () => {
  it('fallback Gemini lorsque regex est partielle', async () => {
    const partial = `\nProfit +1.2 SOL (+10%)\n`;
    mockGemini.mockResolvedValue({
      source: 'gemini',
      tokenMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      tokenName: 'X',
      investedSol: 5,
      soldSol: 6,
      profitSol: 1,
      profitPct: 10,
    });

    const out = await parsePnlMessage('rugpilotprofits', BigInt(42), partial);
    expect(mockGemini).toHaveBeenCalledTimes(1);
    expect(out.source).toBe('gemini');
    expect(out.tokenMint).toContain('EPjFWdd');
  });

  it('échec net si Gemini ne renvoie rien', async () => {
    mockGemini.mockResolvedValue(null);
    const out = await parsePnlMessage('rugpilotprofits', BigInt(3), `Hello world`);
    expect(out.source).toBe('failed');
    expect(out.tokenMint).toBeNull();
  });

  it('ne appelle pas Gemini si TELEGRAM_PNL_USE_GEMINI_FALLBACK=0', async () => {
    const prev = process.env.TELEGRAM_PNL_USE_GEMINI_FALLBACK;
    process.env.TELEGRAM_PNL_USE_GEMINI_FALLBACK = '0';
    try {
      const out = await parsePnlMessage('rugpilotprofits', BigInt(9), `\nProfit +1 SOL\n`);
      expect(mockGemini).not.toHaveBeenCalled();
      expect(out.source).toBe('failed');
    } finally {
      if (prev === undefined) delete process.env.TELEGRAM_PNL_USE_GEMINI_FALLBACK;
      else process.env.TELEGRAM_PNL_USE_GEMINI_FALLBACK = prev;
    }
  });
});
