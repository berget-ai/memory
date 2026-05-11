import Router from "@koa/router";
import type { Context } from "koa";
import { z } from "zod";
import type { CommandHandler } from "../services/commandHandler";
import { parseCommand, parsePipeline, hasPipes } from "../services/commandParser";
import { PipelineExecutor } from "../services/pipelineExecutor";
import { getTipsForCommand } from "../services/agentTips";
import type { SessionContext } from "../domain/memory";

const executeSchema = z.object({
  command: z.string().min(1).max(4096),
  path: z.string().default("/"),
});

const batchSchema = z.object({
  commands: z.array(z.string().min(1)).max(50),
  path: z.string().default("/"),
});

interface MemoryState {
  user: { sub: string };
}

interface MemoryContext extends Context {
  state: MemoryState;
}

export function createMemoryRouter(handler: CommandHandler): Router {
  const router = new Router({ prefix: "/memory" });
  const pipelineExecutor = new PipelineExecutor(handler);

  // POST /memory/exec - Execute a single command or pipeline
  router.post("/exec", async (ctx: MemoryContext) => {
    const body = executeSchema.parse(ctx.request.body);
    const commandStr = body.command;

    const session: SessionContext = {
      userId: ctx.state.user.sub,
      currentPath: body.path,
      palace: { wings: [], rootNodes: [] },
    };

    let result;
    if (hasPipes(commandStr)) {
      const pipeline = parsePipeline(commandStr);
      result = await pipelineExecutor.execute(pipeline, session);
    } else {
      const command = parseCommand(commandStr);
      result = await handler.execute(command, session);
    }

    // Get agent tips based on command
    const tips = getTipsForCommand(commandStr).map((t) => t.message);

    ctx.body = {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      currentPath: result.currentPath,
      tips: tips.length > 0 ? tips : undefined,
    };
  });

  // POST /memory/batch - Execute multiple commands
  router.post("/batch", async (ctx: MemoryContext) => {
    const body = batchSchema.parse(ctx.request.body);
    const results: Array<{
      command: string;
      stdout: string;
      stderr: string;
      exitCode: number;
      currentPath: string;
      tips?: string[];
    }> = [];

    let currentPath = body.path;

    for (const cmdStr of body.commands) {
      const session: SessionContext = {
        userId: ctx.state.user.sub,
        currentPath,
        palace: { wings: [], rootNodes: [] },
      };

      let result;
      if (hasPipes(cmdStr)) {
        const pipeline = parsePipeline(cmdStr);
        result = await pipelineExecutor.execute(pipeline, session);
      } else {
        const command = parseCommand(cmdStr);
        result = await handler.execute(command, session);
      }

      currentPath = result.currentPath;
      const tips = getTipsForCommand(cmdStr).map((t) => t.message);

      results.push({
        command: cmdStr,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        currentPath: result.currentPath,
        tips: tips.length > 0 ? tips : undefined,
      });
    }

    ctx.body = { results, finalPath: currentPath };
  });

  // GET /memory/status - Check memory status
  router.get("/status", async (ctx: MemoryContext) => {
    ctx.body = {
      userId: ctx.state.user.sub,
      status: "active",
      timestamp: new Date().toISOString(),
    };
  });

  return router;
}
