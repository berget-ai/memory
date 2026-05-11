import Koa from "koa";
import bodyParser from "koa-bodyparser";
import { createHealthRouter } from "./routes/health";
import { createMemoryRouter } from "./routes/memory";
import { createEventsRouter } from "./routes/events";
import { createAuthMiddleware } from "./middleware/auth";
import { errorHandler } from "./middleware/errorHandler";
import { KeycloakAuthAdapter } from "./adapters/keycloakAuth";
import { S3StorageAdapter } from "./adapters/s3Storage";
import { InMemoryVectorStore } from "./adapters/inMemoryVectorStore";
import { CommandHandler } from "./services/commandHandler";
import { MemoryEventBus } from "./services/eventBus";

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

export function createApp(): Koa {
  const app = new Koa();

  const auth = new KeycloakAuthAdapter();
  const storage = new S3StorageAdapter();
  const vectorStore = new InMemoryVectorStore();
  const eventBus = new MemoryEventBus();
  const commandHandler = new CommandHandler(storage, vectorStore, (event) => {
    eventBus.emit(event);
  });

  const authMiddleware = createAuthMiddleware(auth);

  app.use(errorHandler);
  app.use(bodyParser());

  // Public routes
  const publicRouter = createHealthRouter();
  app.use(publicRouter.routes());
  app.use(publicRouter.allowedMethods());

  // Protected routes
  app.use(authMiddleware);

  const memoryRouter = createMemoryRouter(commandHandler);
  app.use(memoryRouter.routes());
  app.use(memoryRouter.allowedMethods());

  const eventsRouter = createEventsRouter(eventBus);
  app.use(eventsRouter.routes());
  app.use(eventsRouter.allowedMethods());

  return app;
}

export async function main(): Promise<void> {
  const app = createApp();

  app.listen(PORT, () => {
    console.log(`Memory API running on port ${PORT}`);
  });
}

// Auto-start if this file is the entry point
const isMain = process.argv[1]?.includes("index.js") || process.argv[1]?.includes("index.ts");
if (isMain) {
  main().catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
  });
}
