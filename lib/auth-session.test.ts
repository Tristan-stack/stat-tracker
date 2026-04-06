import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { requireUser } from './auth-session';

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

import { auth } from '@/lib/auth';

describe('requireUser', () => {
  beforeEach(() => {
    vi.mocked(auth.api.getSession).mockReset();
  });

  it('returns 401 response when session is null', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);
    const req = new NextRequest('http://localhost/api/ruggers');
    const result = await requireUser(req);
    expect('response' in result).toBe(true);
    if ('response' in result) {
      expect(result.response.status).toBe(401);
    }
  });

  it('returns userId when session has user', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({
      session: { id: 's1', userId: 'u1' } as never,
      user: { id: 'u1', email: 'a@b.c' } as never,
    });
    const req = new NextRequest('http://localhost/api/ruggers');
    const result = await requireUser(req);
    expect('userId' in result).toBe(true);
    if ('userId' in result) {
      expect(result.userId).toBe('u1');
    }
  });
});
