import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import type { AuthPort, AuthToken } from "../ports/auth";
import { AuthenticationError } from "../domain/errors";

interface KeycloakConfig {
  url: string;
  realm: string;
}

function getEnvOrDefault(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

function getJwksUri(config: KeycloakConfig): string {
  return `${config.url}/realms/${config.realm}/protocol/openid-connect/certs`;
}

export class KeycloakAuthAdapter implements AuthPort {
  private client: jwksClient.JwksClient;
  private config: KeycloakConfig;

  constructor(config?: Partial<KeycloakConfig>) {
    this.config = {
      url: config?.url ?? getEnvOrDefault("KEYCLOAK_URL", "https://keycloak.berget.ai"),
      realm: config?.realm ?? getEnvOrDefault("KEYCLOAK_REALM", "berget"),
    };

    this.client = jwksClient({
      jwksUri: getJwksUri(this.config),
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 10,
    });
  }

  async verifyToken(token: string): Promise<AuthToken> {
    try {
      const decoded = jwt.decode(token, { complete: true });
      if (!decoded?.header?.kid) {
        throw new AuthenticationError("Invalid token format");
      }

      const key = await this.client.getSigningKey(decoded.header.kid);
      const publicKey = key.getPublicKey();

      const verified = jwt.verify(token, publicKey, {
        algorithms: ["RS256"],
        issuer: `${this.config.url}/realms/${this.config.realm}`,
      }) as jwt.JwtPayload;

      if (!verified.sub) {
        throw new AuthenticationError("Token missing subject claim");
      }

      return {
        sub: verified.sub,
        preferred_username: verified.preferred_username,
        email: verified.email,
        realm_access: verified.realm_access,
      };
    } catch (err) {
      if (err instanceof AuthenticationError) throw err;
      throw new AuthenticationError(
        err instanceof Error ? err.message : "Token verification failed"
      );
    }
  }
}
