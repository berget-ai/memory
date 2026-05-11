import Koa from "koa";
import bodyParser from "koa-bodyparser";
import Router from "@koa/router";
import { createMemoryRouter } from "./routes/memory";
import { createEventsRouter } from "./routes/events";
import { errorHandler } from "./middleware/errorHandler";
import { CommandHandler } from "./services/commandHandler";
import { MemoryEventBus } from "./services/eventBus";
import { InMemoryStorageAdapter } from "./adapters/inMemoryStorage";
import { InMemoryVectorStore } from "./adapters/inMemoryVectorStore";
import type { Context, Next } from "koa";

// Dev auth: always succeeds with test user
function devAuthMiddleware() {
  return async (ctx: Context, next: Next) => {
    const authHeader = ctx.headers.authorization;
    
    // Accept any bearer token or dev token
    if (authHeader?.startsWith("Bearer ")) {
      ctx.state.user = {
        sub: "dev-user-123",
        preferred_username: "devuser",
        email: "dev@example.com",
      };
    } else {
      // Allow requests without auth in dev mode
      ctx.state.user = {
        sub: "anonymous",
        preferred_username: "anonymous",
      };
    }
    
    await next();
  };
}

export function createDevApp(): Koa {
  const app = new Koa();
  
  const storage = new InMemoryStorageAdapter();
  const vectorStore = new InMemoryVectorStore();
  const eventBus = new MemoryEventBus();
  
  const commandHandler = new CommandHandler(storage, vectorStore, (event) => {
    eventBus.emit(event);
  });

  app.use(errorHandler);
  app.use(bodyParser());

  // Public routes
  const publicRouter = new Router();
  publicRouter.get("/health", (ctx: Context) => {
    ctx.body = { 
      status: "ok", 
      mode: "dev",
      timestamp: new Date().toISOString() 
    };
  });
  app.use(publicRouter.routes());
  app.use(publicRouter.allowedMethods());

  // Dev auth + protected routes
  app.use(devAuthMiddleware());
  
  const memoryRouter = createMemoryRouter(commandHandler);
  app.use(memoryRouter.routes());
  app.use(memoryRouter.allowedMethods());

  const eventsRouter = createEventsRouter(eventBus);
  app.use(eventsRouter.routes());
  app.use(eventsRouter.allowedMethods());

  // Debug endpoint
  const debugRouter = new Router({ prefix: "/debug" });
  debugRouter.get("/dump", (ctx: Context) => {
    ctx.body = storage.dump(ctx.state.user.sub);
  });
  debugRouter.get("/stats", (ctx: Context) => {
    const all = storage.dump(ctx.state.user.sub);
    const files = Object.values(all).filter((n: any) => n.type === "file");
    const dirs = Object.values(all).filter((n: any) => n.type === "directory");
    ctx.body = {
      total: Object.keys(all).length,
      files: files.length,
      directories: dirs.length,
      vectorStoreSize: vectorStore.getCount(),
    };
  });
  app.use(debugRouter.routes());
  app.use(debugRouter.allowedMethods());

  return app;
}

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3456;

const app = createDevApp();
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║  🧠 Berget Memory API - DEV MODE                         ║
╠══════════════════════════════════════════════════════════╣
║  Port:        ${PORT}                                    ║
║  Storage:     In-Memory (resets on restart)              ║
║  Auth:        Any Bearer token or none                   ║
╠══════════════════════════════════════════════════════════╣
║  Endpoints:                                              ║
║    POST /memory/exec      - Execute single command     ║
║    POST /memory/batch     - Execute batch commands     ║
║    GET  /events/stream    - SSE real-time events       ║
║    GET  /debug/dump       - View all stored data       ║
║    GET  /debug/stats      - Storage statistics         ║
╚══════════════════════════════════════════════════════════╝

Example usage:
  curl http://localhost:${PORT}/health
  
  curl -X POST http://localhost:${PORT}/memory/exec \\
    -H "Content-Type: application/json" \\
    -d '{"command": "mkdir /projects", "path": "/"}'
    
  curl -X POST http://localhost:${PORT}/memory/exec \\
    -H "Content-Type: application/json" \\
    -d '{"command": "write /projects/README.md \"# My Project\"", "path": "/"}'
  
  curl -X POST http://localhost:${PORT}/memory/exec \\
    -H "Content-Type: application/json" \\
    -d '{"command": "ls -l /projects", "path": "/"}'
`);
});
