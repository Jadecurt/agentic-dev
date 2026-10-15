export interface IncomingRequest {
  path: string;
  headers: Record<string, string>;
}

export function authMiddleware(req: IncomingRequest): { authorized: boolean; userId?: string } {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { authorized: false };
  }
  const token = authHeader.replace('Bearer ', '');
  if (token === 'valid-token') {
    return { authorized: true, userId: 'user-default' };
  }
  return { authorized: false };
}
