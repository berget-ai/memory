import type { Context, Next } from "koa";
import { ZodError } from "zod";
import { MemoryError } from "../domain/errors";

export async function errorHandler(ctx: Context, next: Next): Promise<void> {
  try {
    await next();
  } catch (err) {
    if (err instanceof MemoryError) {
      ctx.status = err.statusCode;
      ctx.body = {
        error: err.message,
        code: err.code,
      };
      return;
    }

    if (err instanceof ZodError) {
      ctx.status = 400;
      ctx.body = {
        error: "Validation error",
        code: "VALIDATION_ERROR",
        details: err.errors.map((e) => `${e.path.join(".")}: ${e.message}`),
      };
      return;
    }

    console.error("Unhandled error:", err);
    ctx.status = 500;
    ctx.body = {
      error: "Internal server error",
      code: "INTERNAL_ERROR",
    };
  }
}
