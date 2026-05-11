import Router from "@koa/router";

export function createHealthRouter(): Router {
  const router = new Router();

  router.get("/health", (ctx) => {
    ctx.body = { status: "ok", timestamp: new Date().toISOString() };
  });

  return router;
}
