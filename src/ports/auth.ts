export interface AuthToken {
  sub: string;
  preferred_username?: string;
  email?: string;
  realm_access?: { roles: string[] };
}

export interface AuthPort {
  verifyToken(token: string): Promise<AuthToken>;
}
