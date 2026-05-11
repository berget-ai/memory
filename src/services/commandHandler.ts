import type { StoragePort } from "../ports/storage";
import type { VectorStorePort } from "../ports/vectorStore";
import type { Command } from "../domain/commands";
import type { CommandResult, MemoryNode, SessionContext } from "../domain/memory";
import type { MemoryEvent } from "../domain/events";
import {
  PathAlreadyExistsError,
  PathNotFoundError,
} from "../domain/errors";
import { getName, resolvePath, validatePath } from "./path";
import { SearchEngine } from "./searchEngine";
import { BergetAIEmbeddingAdapter } from "../adapters/bergetAIEmbedding";

let eventIdCounter = 0;
function nextEventId(): string {
  return `evt-${Date.now()}-${++eventIdCounter}`;
}

function formatNode(node: MemoryNode, long: boolean): string {
  if (!long) return node.name + (node.type === "directory" ? "/" : "");

  const type = node.type === "directory" ? "d" : "-";
  const date = new Date(node.updatedAt).toISOString().slice(0, 16).replace("T", " ");
  const tags = node.metadata.tags.length > 0 ? ` [${node.metadata.tags.join(", ")}]` : "";

  return `${type} ${date} ${node.name}${node.type === "directory" ? "/" : ""}${tags}`;
}

function formatTree(nodes: MemoryNode[], prefix: string, depth: number, maxDepth: number): string {
  if (depth >= maxDepth) return "";

  const lines: string[] = [];
  const dirs = nodes.filter((n) => n.type === "directory");
  const files = nodes.filter((n) => n.type === "file");

  for (let i = 0; i < dirs.length; i++) {
    const isLast = i === dirs.length - 1 && files.length === 0;
    lines.push(`${prefix}${isLast ? "└── " : "├── "}${dirs[i].name}/`);
  }

  for (let i = 0; i < files.length; i++) {
    const isLast = i === files.length - 1;
    lines.push(`${prefix}${isLast ? "└── " : "├── "}${files[i].name}`);
  }

  return lines.join("\n");
}

function formatGrepResult(node: MemoryNode, pattern: string, useRegex: boolean): string {
  if (!node.content) return "";

  const lines = node.content.split("\n");
  const matches: string[] = [];

  let regex: RegExp;
  try {
    const cleanPattern = useRegex
      ? pattern.replace(/^\//, "").replace(/\/$/, "")
      : pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    regex = new RegExp(cleanPattern, "i");
  } catch {
    return "";
  }

  for (let i = 0; i < lines.length; i++) {
    if (regex.test(lines[i])) {
      const lineNum = i + 1;
      matches.push(`${node.path}:${lineNum}: ${lines[i]}`);
    }
  }

  return matches.join("\n");
}

export class CommandHandler {
  private searchEngine: SearchEngine;
  private vectorStore?: VectorStorePort;
  private emitEvent?: (event: MemoryEvent) => void;
  private embeddingAdapter: BergetAIEmbeddingAdapter;

  constructor(
    private storage: StoragePort,
    vectorStore?: VectorStorePort,
    emitEvent?: (event: MemoryEvent) => void,
    embeddingAdapter?: BergetAIEmbeddingAdapter
  ) {
    this.searchEngine = new SearchEngine();
    this.vectorStore = vectorStore;
    this.emitEvent = emitEvent;
    this.embeddingAdapter = embeddingAdapter ?? new BergetAIEmbeddingAdapter({
      apiKey: process.env.EMBEDDING_API_KEY,
      baseUrl: process.env.EMBEDDING_BASE_URL,
      model: process.env.EMBEDDING_MODEL,
    });
  }

  private fireEvent(
    type: MemoryEvent["type"],
    ctx: SessionContext,
    path: string,
    nodeType: "file" | "directory",
    metadata?: MemoryEvent["metadata"]
  ): void {
    if (!this.emitEvent) return;

    const event: MemoryEvent = {
      id: nextEventId(),
      type,
      userId: ctx.userId,
      path,
      nodeType,
      timestamp: new Date().toISOString(),
      metadata,
    };

    this.emitEvent(event);
  }

  async execute(command: Command, context: SessionContext): Promise<CommandResult> {
    switch (command.type) {
      case "ls":
        return this.handleLs(command, context);
      case "cat":
        return this.handleCat(command, context);
      case "grep":
        return this.handleGrep(command, context);
      case "mkdir":
        return this.handleMkdir(command, context);
      case "touch":
        return this.handleTouch(command, context);
      case "rm":
        return this.handleRm(command, context);
      case "write":
        return this.handleWrite(command, context);
      case "cd":
        return this.handleCd(command, context);
      case "pwd":
        return this.handlePwd(context);
      case "tree":
        return this.handleTree(command, context);
      case "find":
        return this.handleFind(command, context);
      case "meta":
        return this.handleMeta(command, context);
      case "tag":
        return this.handleTag(command, context);
      case "search":
        return this.handleSearch(command, context);
      case "vsearch":
        return this.handleVSearch(command as unknown as Extract<Command, { type: "search" }> & { type: "vsearch" }, context);
      case "index":
        return this.handleIndex(command, context);
      case "stats":
        return this.handleStats(context);
      case "help":
        return this.handleHelp();
    }
  }

  private async handleLs(
    cmd: Extract<Command, { type: "ls" }>,
    ctx: SessionContext
  ): Promise<CommandResult> {
    const targetPath = cmd.path ? resolvePath(ctx.currentPath, cmd.path) : ctx.currentPath;
    validatePath(targetPath);

    const nodes = await this.storage.listNodes(ctx.userId, targetPath);
    const long = cmd.flags.includes("-l") || cmd.flags.includes("--long");

    const output = nodes.length > 0
      ? nodes.map((n) => formatNode(n, long)).join("\n")
      : "(empty directory)";

    return {
      stdout: output,
      stderr: "",
      exitCode: 0,
      currentPath: ctx.currentPath,
    };
  }

  private async handleCat(
    cmd: Extract<Command, { type: "cat" }>,
    ctx: SessionContext
  ): Promise<CommandResult> {
    const targetPath = resolvePath(ctx.currentPath, cmd.path);
    validatePath(targetPath);

    const node = await this.storage.getNode(ctx.userId, targetPath);
    if (!node) throw new PathNotFoundError(targetPath);
    if (node.type === "directory") {
      return {
        stdout: "",
        stderr: `cat: ${cmd.path}: Is a directory`,
        exitCode: 1,
        currentPath: ctx.currentPath,
      };
    }

    return {
      stdout: node.content ?? "",
      stderr: "",
      exitCode: 0,
      currentPath: ctx.currentPath,
    };
  }

  private async handleGrep(
    cmd: Extract<Command, { type: "grep" }>,
    ctx: SessionContext
  ): Promise<CommandResult> {
    const searchPath = cmd.path ? resolvePath(ctx.currentPath, cmd.path) : ctx.currentPath;
    validatePath(searchPath);

    const recursive = cmd.flags.includes("-r") || cmd.flags.includes("-R");
    const useRegex = cmd.regex ?? false;
    
    // Check if path is a specific file
    const targetNode = await this.storage.getNode(ctx.userId, searchPath);
    let nodes: MemoryNode[];
    
    if (targetNode?.type === "file") {
      nodes = [targetNode];
    } else {
      nodes = recursive
        ? await this.storage.searchNodes(ctx.userId, "", searchPath)
        : await this.storage.listNodes(ctx.userId, searchPath);
    }

    const results: string[] = [];
    for (const node of nodes) {
      if (node.type === "file") {
        // Filter by file type if --include is specified
        if (cmd.include) {
          const globPattern = cmd.include.replace(/\./g, "\\.").replace(/\*/g, ".*");
          const regex = new RegExp(globPattern);
          if (!regex.test(node.name)) continue;
        }

        // Ensure we have content by fetching full node
        const fullNode = node.content !== undefined 
          ? node 
          : await this.storage.getNode(ctx.userId, node.path);
        if (fullNode && fullNode.type === "file") {
          const match = formatGrepResult(fullNode, cmd.pattern, useRegex);
          if (match) results.push(match);
        }
      }
    }

    return {
      stdout: results.join("\n"),
      stderr: results.length === 0 ? `No matches for "${cmd.pattern}"` : "",
      exitCode: results.length === 0 ? 1 : 0,
      currentPath: ctx.currentPath,
    };
  }

  private async handleMkdir(
    cmd: Extract<Command, { type: "mkdir" }>,
    ctx: SessionContext
  ): Promise<CommandResult> {
    const targetPath = resolvePath(ctx.currentPath, cmd.path);
    validatePath(targetPath);

    const existing = await this.storage.getNode(ctx.userId, targetPath);
    if (existing) throw new PathAlreadyExistsError(targetPath);

    const node: MemoryNode = {
      id: targetPath,
      path: targetPath,
      name: getName(targetPath),
      type: "directory",
      metadata: {
        tags: [],
        importance: 0.5,
        references: [],
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await this.storage.putNode(ctx.userId, node);

    this.fireEvent("node.created", ctx, targetPath, "directory", {
      action: "mkdir",
    });

    return {
      stdout: `Created directory: ${targetPath}`,
      stderr: "",
      exitCode: 0,
      currentPath: ctx.currentPath,
    };
  }

  private async handleTouch(
    cmd: Extract<Command, { type: "touch" }>,
    ctx: SessionContext
  ): Promise<CommandResult> {
    const targetPath = resolvePath(ctx.currentPath, cmd.path);
    validatePath(targetPath);

    const existing = await this.storage.getNode(ctx.userId, targetPath);
    if (existing) {
      existing.updatedAt = new Date().toISOString();
      await this.storage.putNode(ctx.userId, existing);
      return {
        stdout: "",
        stderr: "",
        exitCode: 0,
        currentPath: ctx.currentPath,
      };
    }

    const node: MemoryNode = {
      id: targetPath,
      path: targetPath,
      name: getName(targetPath),
      type: "file",
      content: "",
      metadata: {
        tags: [],
        importance: 0.5,
        references: [],
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await this.storage.putNode(ctx.userId, node);

    this.fireEvent("node.created", ctx, targetPath, "file", {
      action: "touch",
      size: 0,
    });

    return {
      stdout: `Created file: ${targetPath}`,
      stderr: "",
      exitCode: 0,
      currentPath: ctx.currentPath,
    };
  }

  private async handleRm(
    cmd: Extract<Command, { type: "rm" }>,
    ctx: SessionContext
  ): Promise<CommandResult> {
    const targetPath = resolvePath(ctx.currentPath, cmd.path);
    validatePath(targetPath);

    const existing = await this.storage.getNode(ctx.userId, targetPath);
    if (!existing) throw new PathNotFoundError(targetPath);

    if (existing.type === "directory" && !cmd.recursive) {
      return {
        stdout: "",
        stderr: `rm: cannot remove '${cmd.path}': Is a directory (use -r for recursive)`,
        exitCode: 1,
        currentPath: ctx.currentPath,
      };
    }

    await this.storage.deleteNode(ctx.userId, targetPath);

    this.fireEvent("node.deleted", ctx, targetPath, existing.type, {
      action: cmd.recursive ? "rm -r" : "rm",
    });

    return {
      stdout: `Removed: ${targetPath}`,
      stderr: "",
      exitCode: 0,
      currentPath: ctx.currentPath,
    };
  }

  private async handleWrite(
    cmd: Extract<Command, { type: "write" }>,
    ctx: SessionContext
  ): Promise<CommandResult> {
    const targetPath = resolvePath(ctx.currentPath, cmd.path);
    validatePath(targetPath);

    const now = new Date().toISOString();
    const existing = await this.storage.getNode(ctx.userId, targetPath);

    const node: MemoryNode = {
      id: targetPath,
      path: targetPath,
      name: getName(targetPath),
      type: "file",
      content: cmd.content,
      metadata: existing?.metadata ?? {
        tags: [],
        importance: 0.5,
        references: [],
      },
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await this.storage.putNode(ctx.userId, node);

    const isNew = !existing;
    this.fireEvent(
      isNew ? "node.created" : "node.updated",
      ctx,
      targetPath,
      "file",
      {
        action: isNew ? "write" : "overwrite",
        size: cmd.content.length,
        tags: node.metadata.tags,
      }
    );

    // Index in vector store if available
    if (this.vectorStore && cmd.content) {
      const embedding = await this.embeddingAdapter.createEmbedding(cmd.content);
      await this.vectorStore.addDocument({
        id: `${ctx.userId}:${targetPath}`,
        path: targetPath,
        content: cmd.content,
        embedding,
        metadata: {
          userId: ctx.userId,
          updatedAt: now,
          tags: node.metadata.tags,
        },
      });
    }

    return {
      stdout: `Wrote ${cmd.content.length} bytes to ${targetPath}`,
      stderr: "",
      exitCode: 0,
      currentPath: ctx.currentPath,
    };
  }

  private async handleCd(
    cmd: Extract<Command, { type: "cd" }>,
    ctx: SessionContext
  ): Promise<CommandResult> {
    const targetPath = resolvePath(ctx.currentPath, cmd.path);
    validatePath(targetPath);

    const node = await this.storage.getNode(ctx.userId, targetPath);
    if (!node) throw new PathNotFoundError(targetPath);
    if (node.type !== "directory") {
      return {
        stdout: "",
        stderr: `cd: ${cmd.path}: Not a directory`,
        exitCode: 1,
        currentPath: ctx.currentPath,
      };
    }

    return {
      stdout: "",
      stderr: "",
      exitCode: 0,
      currentPath: targetPath,
    };
  }

  private async handlePwd(ctx: SessionContext): Promise<CommandResult> {
    return {
      stdout: ctx.currentPath,
      stderr: "",
      exitCode: 0,
      currentPath: ctx.currentPath,
    };
  }

  private async handleTree(
    cmd: Extract<Command, { type: "tree" }>,
    ctx: SessionContext
  ): Promise<CommandResult> {
    const targetPath = cmd.path ? resolvePath(ctx.currentPath, cmd.path) : ctx.currentPath;
    validatePath(targetPath);

    const maxDepth = cmd.depth ?? 3;
    
    // Root path always exists virtually
    if (targetPath !== "/") {
      const node = await this.storage.getNode(ctx.userId, targetPath);
      if (!node) throw new PathNotFoundError(targetPath);
    }

    const children = await this.storage.listNodes(ctx.userId, targetPath);
    const treeOutput = targetPath + "\n" + formatTree(children, "", 0, maxDepth);

    return {
      stdout: treeOutput,
      stderr: "",
      exitCode: 0,
      currentPath: ctx.currentPath,
    };
  }

  private async handleFind(
    cmd: Extract<Command, { type: "find" }>,
    ctx: SessionContext
  ): Promise<CommandResult> {
    const searchPath = cmd.path ? resolvePath(ctx.currentPath, cmd.path) : ctx.currentPath;
    validatePath(searchPath);

    const nodes = await this.storage.searchNodes(ctx.userId, cmd.pattern, searchPath);

    let results: MemoryNode[];
    if (cmd.regex) {
      try {
        const cleanPattern = cmd.pattern.replace(/^\//, "").replace(/\/$/, "");
        const regex = new RegExp(cleanPattern, "i");
        results = nodes.filter((n) => regex.test(n.path));
      } catch {
        return {
          stdout: "",
          stderr: `Invalid regex pattern: ${cmd.pattern}`,
          exitCode: 1,
          currentPath: ctx.currentPath,
        };
      }
    } else {
      results = nodes;
    }

    const output = results.map((n) => n.path).join("\n");

    return {
      stdout: output,
      stderr: results.length === 0 ? `No matches for "${cmd.pattern}"` : "",
      exitCode: results.length === 0 ? 1 : 0,
      currentPath: ctx.currentPath,
    };
  }

  private async handleMeta(
    cmd: Extract<Command, { type: "meta" }>,
    ctx: SessionContext
  ): Promise<CommandResult> {
    const targetPath = resolvePath(ctx.currentPath, cmd.path);
    validatePath(targetPath);

    const node = await this.storage.getNode(ctx.userId, targetPath);
    if (!node) throw new PathNotFoundError(targetPath);

    if (!cmd.key) {
      const meta = [
        `Path: ${node.path}`,
        `Type: ${node.type}`,
        `Created: ${node.createdAt}`,
        `Updated: ${node.updatedAt}`,
        `Tags: ${node.metadata.tags.join(", ") || "(none)"}`,
        `Importance: ${node.metadata.importance}`,
        `References: ${node.metadata.references.join(", ") || "(none)"}`,
      ];

      return {
        stdout: meta.join("\n"),
        stderr: "",
        exitCode: 0,
        currentPath: ctx.currentPath,
      };
    }

    if (cmd.key === "importance" && cmd.value) {
      node.metadata.importance = parseFloat(cmd.value);
    } else if (cmd.key === "tags" && cmd.value) {
      node.metadata.tags = cmd.value.split(",").map((t) => t.trim());
    }

    node.updatedAt = new Date().toISOString();
    await this.storage.putNode(ctx.userId, node);

    return {
      stdout: `Updated ${cmd.key} for ${targetPath}`,
      stderr: "",
      exitCode: 0,
      currentPath: ctx.currentPath,
    };
  }

  private async handleTag(
    cmd: Extract<Command, { type: "tag" }>,
    ctx: SessionContext
  ): Promise<CommandResult> {
    const targetPath = resolvePath(ctx.currentPath, cmd.path);
    validatePath(targetPath);

    const node = await this.storage.getNode(ctx.userId, targetPath);
    if (!node) throw new PathNotFoundError(targetPath);

    if (cmd.remove) {
      node.metadata.tags = node.metadata.tags.filter((t) => !cmd.tags.includes(t));
    } else {
      node.metadata.tags = [...new Set([...node.metadata.tags, ...cmd.tags])];
    }

    node.updatedAt = new Date().toISOString();
    await this.storage.putNode(ctx.userId, node);

    this.fireEvent("node.tagged", ctx, targetPath, node.type, {
      action: cmd.remove ? "tags-removed" : "tags-added",
      tags: cmd.tags,
    });

    return {
      stdout: `${cmd.remove ? "Removed" : "Added"} tags on ${targetPath}: ${cmd.tags.join(", ")}`,
      stderr: "",
      exitCode: 0,
      currentPath: ctx.currentPath,
    };
  }

  private async handleSearch(
    cmd: Extract<Command, { type: "search" }>,
    ctx: SessionContext
  ): Promise<CommandResult> {
    const searchPath = cmd.path ? resolvePath(ctx.currentPath, cmd.path) : ctx.currentPath;
    validatePath(searchPath);

    const nodes = await this.storage.searchNodes(ctx.userId, "", searchPath);
    const files = nodes.filter((n) => n.type === "file");

    for (const node of files) {
      this.searchEngine.indexNode(node);
    }

    const results = this.searchEngine.search(cmd.query, cmd.limit ?? 20);

    const output = results.length > 0
      ? results.map((r, i) => `${i + 1}. ${r.path} (score: ${r.score.toFixed(2)})`).join("\n")
      : "No results found";

    return {
      stdout: output,
      stderr: "",
      exitCode: results.length === 0 ? 1 : 0,
      currentPath: ctx.currentPath,
    };
  }

  private async handleVSearch(
    cmd: Extract<Command, { type: "search" }> & { type: "vsearch" },
    ctx: SessionContext
  ): Promise<CommandResult> {
    if (!this.vectorStore) {
      return {
        stdout: "",
        stderr: "Vector search not available. Install a vector database adapter.",
        exitCode: 1,
        currentPath: ctx.currentPath,
      };
    }

    const query = (cmd as unknown as { query: string }).query ?? "";
    const limit = (cmd as unknown as { limit?: number }).limit ?? 10;
    const embedding = await this.embeddingAdapter.createEmbedding(query);

    const results = await this.vectorStore.search(embedding, limit);

    const output = results.length > 0
      ? results.map((r, i) => `${i + 1}. ${r.path} (similarity: ${r.score.toFixed(3)})\n   ${r.content.slice(0, 100)}...`).join("\n")
      : "No semantic matches found";

    return {
      stdout: output,
      stderr: "",
      exitCode: results.length === 0 ? 1 : 0,
      currentPath: ctx.currentPath,
    };
  }

  private async handleIndex(
    cmd: Extract<Command, { type: "index" }>,
    ctx: SessionContext
  ): Promise<CommandResult> {
    const targetPath = cmd.path ? resolvePath(ctx.currentPath, cmd.path) : ctx.currentPath;
    validatePath(targetPath);

    const count = await this.searchEngine.rebuildIndex(this.storage, ctx.userId, targetPath);

    // Also index in vector store if available
    if (this.vectorStore) {
      const nodes = await this.storage.searchNodes(ctx.userId, "", targetPath);
      const docs = await Promise.all(
        nodes
          .filter((n) => n.type === "file" && n.content)
          .map(async (n) => ({
            id: `${ctx.userId}:${n.path}`,
            path: n.path,
            content: n.content ?? "",
            embedding: await this.embeddingAdapter.createEmbedding(n.content ?? ""),
            metadata: {
              userId: ctx.userId,
              tags: n.metadata.tags,
            },
          }))
      );

      await this.vectorStore.addDocuments(docs);
    }

    this.fireEvent("node.indexed", ctx, targetPath, "directory", {
      action: "index",
      size: count,
    });

    return {
      stdout: `Indexed ${count} documents in ${targetPath}`,
      stderr: "",
      exitCode: 0,
      currentPath: ctx.currentPath,
    };
  }

  private async handleStats(ctx: SessionContext): Promise<CommandResult> {
    const nodes = await this.storage.searchNodes(ctx.userId, "", ctx.currentPath);
    const files = nodes.filter((n) => n.type === "file");
    const dirs = nodes.filter((n) => n.type === "directory");

    const totalSize = files.reduce((acc, f) => acc + (f.content?.length ?? 0), 0);
    const allTags = new Set(files.flatMap((f) => f.metadata.tags));
    const vectorCount = this.vectorStore ? " (vector store active)" : "";

    const stats = [
      `Memory Palace Statistics${vectorCount}`,
      `========================`,
      `Total nodes: ${nodes.length}`,
      `Files: ${files.length}`,
      `Directories: ${dirs.length}`,
      `Total content size: ${totalSize} bytes`,
      `Unique tags: ${allTags.size}`,
      `Current path: ${ctx.currentPath}`,
    ];

    return {
      stdout: stats.join("\n"),
      stderr: "",
      exitCode: 0,
      currentPath: ctx.currentPath,
    };
  }

  private handleHelp(): CommandResult {
    const helpText = `
Berget Memory Palace - Help
===========================

COMMANDS (bash subset):
  ls [path] [-l]              List directory contents
  cat <path>                  Display file contents
  grep <pattern> [path] [-r]  Search for pattern in files
  mkdir <path>                Create a directory
  write <path> <content>      Write content to a file
  cd <path>                   Change directory
  pwd                         Print working directory
  tree [path] [-L<n>]         Display directory tree
  find <pattern> [path]      Find files by name pattern
  meta <path> [key] [value]   View or edit metadata
  tag <path> <tags...> [-d]   Add or remove tags
  search <query> [path]        Full-text search with ranking
  vsearch <query> [path]       Semantic/vector search
  index [path]                Rebuild search index
  help                        Show this help

Pipelines: cmd1 | cmd2 | cmd3

MEMPALACE STRATEGIES:
  Your memory is organized like a palace:

  WINGS (top-level directories):
    /projects        Active projects and code
    /conversations   Meeting notes, decisions, context
    /knowledge       Research, architecture, patterns
    /people          Contacts, relationships, preferences
    /tasks           TODOs, sprints, deadlines

  ROOMS (subdirectories):
    Group related files. Example:
    /projects/ecommerce/frontend
    /projects/ecommerce/backend
    /projects/ecommerce/docs

  DRAWERS (files):
    Each file is a focused memory. Keep under 500 lines.
    Split large topics: overview.md, details.md, examples.md

  NAMING:
    Use kebab-case: api-gateway-design.md
    Use dates for chronological: 2024-01-15-meeting.md
    Be descriptive: bad="notes.md" good="graphql-vs-rest-decision.md"

  TAGGING:
    Tag everything immediately after creation.
    Use consistent tags: backend, frontend, urgent, decision, research
    Tags enable fast filtering and search.

  CONTEXT FILES:
    Store session context in /conversations/<topic>/context.md
    Update after each session for continuity.
    Include: attendees, decisions, action items, next steps.

  SEARCH STRATEGIES:
    grep <pattern> / -r        Exact text search (fast)
    search <query> /path       Full-text with ranking
    vsearch <concept> /path    Semantic similarity (find related ideas)
    find <pattern> /path       Find by filename

  RETRIEVAL PATTERNS:
    1. Know what you want? Use cat <path>
    2. Looking for something? Use grep or search
    3. Exploring? Use tree and ls
    4. Need related content? Use vsearch

TIPS:
  - Run 'index /' after bulk imports for search
  - Tag files immediately for organization
  - Keep files focused and small
  - Use cross-references: "See also: /knowledge/cqrs.md"
  - Store conversation context for session continuity
`.trim();

    return {
      stdout: helpText,
      stderr: "",
      exitCode: 0,
      currentPath: "/",
    };
  }
}
