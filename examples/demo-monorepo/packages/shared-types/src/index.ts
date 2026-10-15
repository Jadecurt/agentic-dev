export interface UserIdentity {
  userId: string;
  email: string;
  role: 'admin' | 'user' | 'guest';
}

export interface ServiceHealth {
  service: string;
  status: 'healthy' | 'degraded' | 'down';
  uptimeSeconds: number;
}
