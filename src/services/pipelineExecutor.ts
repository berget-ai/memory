import type { Pipeline } from "../domain/commands";
import type { CommandResult, SessionContext } from "../domain/memory";
import type { CommandHandler } from "./commandHandler";

export class PipelineExecutor {
  constructor(private handler: CommandHandler) {}

  async execute(pipeline: Pipeline, context: SessionContext): Promise<CommandResult> {
    if (pipeline.commands.length === 0) {
      return {
        stdout: "",
        stderr: "Empty pipeline",
        exitCode: 1,
        currentPath: context.currentPath,
      };
    }

    if (pipeline.commands.length === 1) {
      return this.handler.execute(pipeline.commands[0], context);
    }

    let currentPath = context.currentPath;
    let accumulatedStdout = "";
    let lastStderr = "";
    let lastExitCode = 0;

    for (let i = 0; i < pipeline.commands.length; i++) {
      const cmd = pipeline.commands[i];
      const isLast = i === pipeline.commands.length - 1;

      const session: SessionContext = {
        userId: context.userId,
        currentPath,
        palace: context.palace,
      };

      const result = await this.handler.execute(cmd, session);
      currentPath = result.currentPath;
      lastStderr = result.stderr;
      lastExitCode = result.exitCode;

      if (isLast) {
        accumulatedStdout += result.stdout;
      } else {
        accumulatedStdout = result.stdout;
      }
    }

    return {
      stdout: accumulatedStdout,
      stderr: lastStderr,
      exitCode: lastExitCode,
      currentPath,
    };
  }
}
