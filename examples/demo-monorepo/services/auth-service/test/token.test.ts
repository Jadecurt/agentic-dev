import { describe, it, expect } from 'vitest';
import { generateAccessToken, verifyAccessToken } from '../src/token.js';

describe('Auth Service Token Module', () => {
  it('generates a valid token with expiration and roles', () => {
    const token = generateAccessToken('user-123', ['admin']);
    expect(token.userId).toBe('user-123');
    expect(token.roles).toContain('admin');
    expect(token.expiresAt).toBeGreaterThan(Date.now());
  });

  it('validates active token correctly', () => {
    const token = generateAccessToken('user-abc');
    expect(verifyAccessToken(token)).toBe(true);
  });
});
