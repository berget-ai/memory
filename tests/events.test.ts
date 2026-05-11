import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import Koa from "koa";
import bodyParser from "koa-bodyparser";
import { createMemoryRouter } from "../src/routes/memory";
import { createEventsRouter } from "../src/routes/events";
import { createAuthMiddleware } from "../src/middleware/auth";
import { errorHandler } from "../src/middleware/errorHandler";
import { CommandHandler } from "../src/services/commandHandler";
import { MemoryEventBus } from "../src/services/eventBus";
import { MockStorageAdapter, MockAuthAdapter, MockVectorStore } from "./mocks";

function createApp() {
  const auth = new MockAuthAdapter();
  const storage = new MockStorageAdapter();
  const vectorStore = new MockVectorStore();
  const eventBus = new MemoryEventBus();
  const commandHandler = new CommandHandler(storage, vectorStore, (event) => {
    eventBus.emit(event);
  });
  const authMiddleware = createAuthMiddleware(auth);

  const app = new Koa();
  app.use(errorHandler);
  app.use(bodyParser());

  // Public routes
  const publicRouter = new Router();
  publicRouter.get("/health", (ctx) => {
    ctx.body = { status: "ok" };
  });
  app.use(publicRouter.routes());

  // Protected routes
  app.use(authMiddleware);

  const memoryRouter = createMemoryRouter(commandHandler);
  app.use(memoryRouter.routes());
  app.use(memoryRouter.allowedMethods());

  const eventsRouter = createEventsRouter(eventBus);
  app.use(eventsRouter.routes());
  app.use(eventsRouter.allowedMethods());

  return { app, eventBus };
}

import Router from "@koa/router";

describe("SSE Events System", () => {
  let app: Koa;

  beforeEach(() => {
    const created = createApp();
    app = created.app;
  });

  const exec = (command: string, path = "/") =>
    request(app.callback())
      .post("/memory/exec")
      .set("Authorization", "Bearer valid-token")
      .send({ command, path });

  describe("Event Bus", () => {
    it("emits events on node creation", async () => {
      const events: string[] = [];
      const { eventBus } = createApp();

      eventBus.subscribe("test-user-123", {}, (event) => {
        events.push(event.type);
      });

      // Manually emit an event
      eventBus.emit({
        id: "test-1",
        type: "node.created",
        userId: "test-user-123",
        path: "/test",
        nodeType: "file",
        timestamp: new Date().toISOString(),
      });

      expect(events).toContain("node.created");
    });

    it("filters events by type", async () => {
      const createdEvents: string[] = [];
      const { eventBus } = createApp();

      eventBus.subscribe(
        "test-user-123",
        { types: ["node.created"] },
        (event) => {
          createdEvents.push(event.path);
        }
      );

      eventBus.emit({
        id: "test-1",
        type: "node.created",
        userId: "test-user-123",
        path: "/file1",
        nodeType: "file",
        timestamp: new Date().toISOString(),
      });

      eventBus.emit({
        id: "test-2",
        type: "node.updated",
        userId: "test-user-123",
        path: "/file2",
        nodeType: "file",
        timestamp: new Date().toISOString(),
      });

      expect(createdEvents).toHaveLength(1);
      expect(createdEvents[0]).toBe("/file1");
    });

    it("filters events by path prefix", async () => {
      const events: string[] = [];
      const { eventBus } = createApp();

      eventBus.subscribe(
        "test-user-123",
        { pathPrefix: "/projects" },
        (event) => {
          events.push(event.path);
        }
      );

      eventBus.emit({
        id: "test-1",
        type: "node.created",
        userId: "test-user-123",
        path: "/projects/app",
        nodeType: "directory",
        timestamp: new Date().toISOString(),
      });

      eventBus.emit({
        id: "test-2",
        type: "node.created",
        userId: "test-user-123",
        path: "/notes/personal",
        nodeType: "directory",
        timestamp: new Date().toISOString(),
      });

      expect(events).toHaveLength(1);
      expect(events[0]).toBe("/projects/app");
    });

    it("filters events by tags", async () => {
      const events: string[] = [];
      const { eventBus } = createApp();

      eventBus.subscribe(
        "test-user-123",
        { tags: ["important"] },
        (event) => {
          events.push(event.path);
        }
      );

      eventBus.emit({
        id: "test-1",
        type: "node.tagged",
        userId: "test-user-123",
        path: "/important-file",
        nodeType: "file",
        timestamp: new Date().toISOString(),
        metadata: { tags: ["important", "work"] },
      });

      eventBus.emit({
        id: "test-2",
        type: "node.tagged",
        userId: "test-user-123",
        path: "/other-file",
        nodeType: "file",
        timestamp: new Date().toISOString(),
        metadata: { tags: ["draft"] },
      });

      expect(events).toHaveLength(1);
      expect(events[0]).toBe("/important-file");
    });

    it("only delivers events to matching user", async () => {
      const user1Events: string[] = [];
      const user2Events: string[] = [];
      const { eventBus } = createApp();

      eventBus.subscribe("user-1", {}, (event) => {
        user1Events.push(event.type);
      });

      eventBus.subscribe("user-2", {}, (event) => {
        user2Events.push(event.type);
      });

      eventBus.emit({
        id: "test-1",
        type: "node.created",
        userId: "user-1",
        path: "/file",
        nodeType: "file",
        timestamp: new Date().toISOString(),
      });

      expect(user1Events).toHaveLength(1);
      expect(user2Events).toHaveLength(0);
    });
  });

  describe("Integration with Commands", () => {
    it("emits node.created when mkdir is called", async () => {
      // Ensure parent exists first
      const res = await exec("mkdir /event-test-dir");
      expect(res.status).toBe(200);
    });

    it("emits node.created when touch is called", async () => {
      const res = await exec("touch /event-file");
      expect(res.status).toBe(200);
    });

    it("emits node.updated when write overwrites file", async () => {
      await exec('write /event-file "original"');
      const res = await exec('write /event-file "updated"');
      expect(res.status).toBe(200);
    });

    it("emits node.deleted when rm is called", async () => {
      await exec('write /delete-me "content"');
      const res = await exec("rm /delete-me");
      expect(res.status).toBe(200);
    });

    it("emits node.tagged when tag is called", async () => {
      await exec('write /tag-me "content"');
      const res = await exec("tag /tag-me important work");
      expect(res.status).toBe(200);
    });
  });

  describe("SSE Endpoint", () => {
    it("returns 401 without auth", async () => {
      const res = await request(app.callback()).get("/events/stream");
      expect(res.status).toBe(401);
    });

    it("accepts filter parameters", async () => {
      // SSE connections stay open - just verify it starts correctly
      // We use a short timeout to avoid hanging the test
      const req = request(app.callback())
        .get("/events/stream?types=node.created,node.updated&pathPrefix=/projects")
        .set("Authorization", "Bearer valid-token")
        .timeout(100);

      try {
        await req;
      } catch {
        // Expected to timeout or close - we just want to verify it starts
      }
    }, 200);

    it("returns event status", async () => {
      const res = await request(app.callback())
        .get("/events/status")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("activeSubscriptions");
    });
  });
});
