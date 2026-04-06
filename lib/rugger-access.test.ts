import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ruggerExistsForUser } from './rugger-access';

vi.mock('@/lib/db', () => ({
  query: vi.fn(),
}));

import { query } from '@/lib/db';

describe('ruggerExistsForUser', () => {
  beforeEach(() => {
    vi.mocked(query).mockReset();
  });

  it('returns true when a row exists', async () => {
    vi.mocked(query).mockResolvedValue([{ id: 'r1' }]);
    await expect(ruggerExistsForUser('r1', 'u1')).resolves.toBe(true);
    expect(query).toHaveBeenCalledWith(
      'select id from ruggers where id = $1 and user_id = $2',
      ['r1', 'u1']
    );
  });

  it('returns false when no row', async () => {
    vi.mocked(query).mockResolvedValue([]);
    await expect(ruggerExistsForUser('r1', 'u1')).resolves.toBe(false);
  });
});
