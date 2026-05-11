import type { Context, Next } from "koa";
import type { AuthPort } from "../ports/auth";
import { AuthenticationError } from "../domain/errors";

interface AuthContext extends Context {
  state: {
    user?: {
      sub: string;
      preferred_username?: string;
      email?: string;
    };
  };
}

export function createAuthMiddleware(auth: AuthPort) {
  return async (ctx: AuthContext, next: Next): Promise<void> => {
    const authHeader = ctx.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      ctx.status = 401;
      ctx.body = { error: "Missing or invalid authorization header" };
      return;
    }

    const token = authHeader.slice(7);

    try {
      const decoded = await auth.verifyToken(token);
      ctx.state.user = decoded;
      await next();
    } catch (err) {
      if (err instanceof AuthenticationError) {
        ctx.status = err.statusCode;
        ctx.body = { error: err.message, code: err.code };
        return;
      }
      ctx.status = 401;
      ctx.body = { error: "Authentication failed" };
    }
  };
}
