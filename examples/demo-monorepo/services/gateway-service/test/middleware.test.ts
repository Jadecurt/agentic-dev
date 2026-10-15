import { describe, it, expect } from 'vitest';
import { authMiddleware } from '../src/middleware.js';

describe('Gateway Auth Middleware', () => {
  it('rejects missing authorization header', () => {
    const res = authMiddleware({ path: '/api/resource', headers: {} });
    expect(res.authorized).toBe(false);
  });

  it('authorizes valid bearer token', () => {
    const res = authMiddleware({ path: '/api/resource', headers: { authorization: 'Bearer valid-token' } });
    expect(res.authorized).toBe(true);
    expect(res.userId).toBe('user-default');
  });
});
