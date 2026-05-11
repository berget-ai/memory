import type { Command, Pipeline } from "../domain/commands";
import { InvalidCommandError } from "../domain/errors";

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inQuotes = false;
  let quoteChar = "";

  for (const char of input) {
    if ((char === '"' || char === "'") && !inQuotes) {
      inQuotes = true;
      quoteChar = char;
      continue;
    }

    if (char === quoteChar && inQuotes) {
      inQuotes = false;
      quoteChar = "";
      tokens.push(current);
      current = "";
      continue;
    }

    if (char === " " && !inQuotes) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current || inQuotes) {
    tokens.push(current);
  }

  return tokens;
}

function extractFlags(tokens: string[]): { flags: string[]; args: string[] } {
  const flags: string[] = [];
  const args: string[] = [];

  for (const token of tokens) {
    if (token.startsWith("-")) {
      flags.push(token);
    } else {
      args.push(token);
    }
  }

  return { flags, args };
}

function isRegexPattern(pattern: string): boolean {
  return pattern.startsWith("/") && pattern.endsWith("/");
}

function parseSingleCommand(tokens: string[]): Command {
  if (tokens.length === 0) {
    throw new InvalidCommandError("empty command");
  }

  const [cmd, ...rest] = tokens;
  const { flags, args } = extractFlags(rest);

  switch (cmd) {
    case "ls":
      return { type: "ls", path: args[0], flags };

    case "cat":
      if (!args[0]) throw new InvalidCommandError("cat requires a path");
      return { type: "cat", path: args[0] };

    case "grep": {
      if (!args[0]) throw new InvalidCommandError("grep requires a pattern");
      const pattern = args[0];
      
      // Extract --include flag
      const includeFlag = flags.find((f) => f.startsWith("--include="));
      const includePattern = includeFlag ? includeFlag.slice(10) : undefined;
      const cleanFlags = flags.filter((f) => !f.startsWith("--include="));
      
      return {
        type: "grep",
        pattern,
        path: args[1],
        flags: cleanFlags,
        regex: isRegexPattern(pattern) || cleanFlags.includes("-E") || cleanFlags.includes("--regex"),
        include: includePattern,
      };
    }

    case "mkdir":
      if (!args[0]) throw new InvalidCommandError("mkdir requires a path");
      return { type: "mkdir", path: args[0] };

    case "touch":
      if (!args[0]) throw new InvalidCommandError("touch requires a path");
      return { type: "touch", path: args[0] };

    case "rm":
      if (!args[0]) throw new InvalidCommandError("rm requires a path");
      return {
        type: "rm",
        path: args[0],
        recursive: flags.includes("-r") || flags.includes("-R"),
      };

    case "write": {
      if (!args[0]) throw new InvalidCommandError("write requires a path");
      const content = args.slice(1).join(" ");
      return { type: "write", path: args[0], content };
    }

    case "cd":
      if (!args[0]) throw new InvalidCommandError("cd requires a path");
      return { type: "cd", path: args[0] };

    case "pwd":
      return { type: "pwd" };

    case "tree": {
      const depthFlag = flags.find((f) => f.startsWith("-L"));
      return {
        type: "tree",
        path: args[0],
        depth: depthFlag ? parseInt(depthFlag.slice(2), 10) : undefined,
      };
    }

    case "find": {
      if (!args[0]) throw new InvalidCommandError("find requires a pattern");
      const pattern = args[0];
      return {
        type: "find",
        pattern,
        path: args[1],
        regex: isRegexPattern(pattern),
      };
    }

    case "meta": {
      if (!args[0]) throw new InvalidCommandError("meta requires a path");
      const [path, key, ...valueParts] = args;
      return {
        type: "meta",
        path,
        key,
        value: valueParts.join(" ") || undefined,
      };
    }

    case "tag": {
      if (!args[0]) throw new InvalidCommandError("tag requires a path");
      const remove = flags.includes("-d");
      const path = args[0];
      const tags = args.slice(1);
      return { type: "tag", path, tags, remove };
    }

    case "search": {
      if (!args[0]) throw new InvalidCommandError("search requires a query");
      const limitFlag = flags.find((f) => f.startsWith("-n"));
      return {
        type: "search",
        query: args[0],
        path: args[1],
        limit: limitFlag ? parseInt(limitFlag.slice(2), 10) : undefined,
      };
    }

    case "vsearch": {
      if (!args[0]) throw new InvalidCommandError("vsearch requires a query");
      const vlimitFlag = flags.find((f) => f.startsWith("-n"));
      return {
        type: "vsearch",
        query: args[0],
        path: args[1],
        limit: vlimitFlag ? parseInt(vlimitFlag.slice(2), 10) : undefined,
      };
    }

    case "index":
      return { type: "index", path: args[0] };

    case "stats":
      return { type: "stats" };

    case "help":
      return { type: "help" };

    default:
      throw new InvalidCommandError(cmd);
  }
}

export function parseCommand(input: string): Command {
  const tokens = tokenize(input.trim());
  return parseSingleCommand(tokens);
}

export function parsePipeline(input: string): Pipeline {
  const parts = input.split("|").map((p) => p.trim());
  const commands: Command[] = [];

  for (const part of parts) {
    if (part) {
      commands.push(parseCommand(part));
    }
  }

  return { commands };
}

export function hasPipes(input: string): boolean {
  return input.includes("|");
}
