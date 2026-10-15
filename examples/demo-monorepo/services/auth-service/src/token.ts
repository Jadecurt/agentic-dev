export interface TokenPayload {
  userId: string;
  roles: string[];
  expiresAt: number;
}

export function generateAccessToken(userId: string, roles: string[] = ['user']): TokenPayload {
  return {
    userId,
    roles,
    expiresAt: Date.now() + 3600 * 1000,
  };
}

export function verifyAccessToken(token: TokenPayload): boolean {
  if (!token.userId) return false;
  return token.expiresAt > Date.now();
}
