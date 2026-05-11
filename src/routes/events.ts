import Router from "@koa/router";
import type { Context } from "koa";
import { z } from "zod";
import type { MemoryEventBus } from "../services/eventBus";
import type { EventFilter } from "../domain/events";

const filterSchema = z.object({
  types: z.array(z.string()).optional(),
  pathPrefix: z.string().optional(),
  nodeType: z.enum(["file", "directory"]).optional(),
  tags: z.array(z.string()).optional(),
});

interface EventState {
  user: { sub: string };
}

interface EventContext extends Context {
  state: EventState;
}

export function createEventsRouter(eventBus: MemoryEventBus): Router {
  const router = new Router({ prefix: "/events" });

  // GET /events/stream - SSE endpoint for real-time memory events
  router.get("/stream", async (ctx: EventContext) => {
    // Parse filter from query params
    const queryFilter: Record<string, unknown> = {};
    if (ctx.query.types) {
      queryFilter.types = String(ctx.query.types).split(",");
    }
    if (ctx.query.pathPrefix) {
      queryFilter.pathPrefix = String(ctx.query.pathPrefix);
    }
    if (ctx.query.nodeType) {
      queryFilter.nodeType = String(ctx.query.nodeType);
    }
    if (ctx.query.tags) {
      queryFilter.tags = String(ctx.query.tags).split(",");
    }

    const filter = filterSchema.parse(queryFilter);

    // Set SSE headers
    ctx.set("Content-Type", "text/event-stream");
    ctx.set("Cache-Control", "no-cache");
    ctx.set("Connection", "keep-alive");
    ctx.status = 200;

    // Get the response body stream
    const body = ctx.res;
    body.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    // Send initial connection event
    body.write(`event: connected\n`);
    body.write(`data: ${JSON.stringify({
      message: "SSE connection established",
      userId: ctx.state.user.sub,
      filter,
      timestamp: new Date().toISOString(),
    })}\n\n`);

    // Subscribe to events
    const subscriberId = eventBus.subscribe(
      ctx.state.user.sub,
      filter as EventFilter,
      (event) => {
        body.write(`event: ${event.type}\n`);
        body.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    );

    // Handle client disconnect
    ctx.req.on("close", () => {
      eventBus.unsubscribe(subscriberId);
    });

    // Keep connection alive with heartbeat
    const heartbeat = setInterval(() => {
      body.write(`:heartbeat\n\n`);
    }, 30000);

    ctx.req.on("close", () => {
      clearInterval(heartbeat);
    });

    // Keep the connection open
    return new Promise(() => {
      // Intentionally never resolves - connection stays open until client disconnects
    });
  });

  // GET /events/status - Check event bus status
  router.get("/status", (ctx: EventContext) => {
    const count = eventBus.getSubscriberCount(ctx.state.user.sub);
    ctx.body = {
      activeSubscriptions: count,
      timestamp: new Date().toISOString(),
    };
  });

  return router;
}
