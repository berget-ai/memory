import { promises as fs, constants } from "fs";
import path from "path";
import type { StoragePort } from "../ports/storage";
import type { MemoryNode, MemoryPalace, MemoryMetadata } from "../domain/memory";
import { PathNotFoundError } from "../domain/errors";

export interface FileSystemStorageConfig {
  basePath: string;
}

function sanitizePath(userPath: string): string {
  return path.normalize(userPath).replace(/^\/+|\/+$/g, "");
}

function getUserBasePath(basePath: string, userId: string): string {
  return path.join(basePath, "users", userId);
}

function createDefaultMetadata(): MemoryMetadata {
  return {
    tags: [],
    importance: 0,
    references: [],
  };
}

export class FileSystemStorageAdapter implements StoragePort {
  private basePath: string;

  constructor(config?: FileSystemStorageConfig) {
    this.basePath = config?.basePath ?? process.env.STORAGE_PATH ?? "/data/memory";
  }

  private getPath(userId: string, memoryPath: string): string {
    const safePath = sanitizePath(memoryPath);
    return path.join(getUserBasePath(this.basePath, userId), safePath);
  }

  private getMetaPath(userId: string, memoryPath: string): string {
    return this.getPath(userId, memoryPath) + ".meta.json";
  }

  async init(): Promise<void> {
    await fs.mkdir(this.basePath, { recursive: true });
  }

  async listNodes(userId: string, path: string): Promise<MemoryNode[]> {
    const dirPath = this.getPath(userId, path);

    try {
      await fs.access(dirPath, constants.F_OK);
    } catch {
      return [];
    }

    const stats = await fs.stat(dirPath);
    if (!stats.isDirectory()) {
      return [];
    }

    const entries = await fs.readdir(dirPath);
    const nodes: MemoryNode[] = [];

    for (const entry of entries) {
      if (entry.endsWith(".meta.json")) continue;

      const entryPath = path === "/" ? `/${entry}` : `${path}/${entry}`;
      const node = await this.getNode(userId, entryPath);
      if (node) {
        nodes.push(node);
      }
    }

    return nodes;
  }

  async getNode(userId: string, path: string): Promise<MemoryNode | null> {
    const filePath = this.getPath(userId, path);
    const metaPath = this.getMetaPath(userId, path);

    try {
      await fs.access(filePath, constants.F_OK);
    } catch {
      return null;
    }

    const stats = await fs.stat(filePath);

    if (stats.isDirectory()) {
      try {
        const metaContent = await fs.readFile(metaPath, "utf-8");
        const node = JSON.parse(metaContent) as MemoryNode;
        node.content = undefined;
        return node;
      } catch {
        return {
          id: path,
          path,
          name: path.split("/").pop() ?? path,
          type: "directory",
          content: undefined,
          createdAt: stats.birthtime.toISOString(),
          updatedAt: stats.mtime.toISOString(),
          metadata: createDefaultMetadata(),
        };
      }
    }

    try {
      const metaContent = await fs.readFile(metaPath, "utf-8");
      const node = JSON.parse(metaContent) as MemoryNode;
      node.content = await fs.readFile(filePath, "utf-8");
      return node;
    } catch {
      return {
        id: path,
        path,
        name: path.split("/").pop() ?? path,
        type: "file",
        content: await fs.readFile(filePath, "utf-8"),
        createdAt: stats.birthtime.toISOString(),
        updatedAt: stats.mtime.toISOString(),
        metadata: createDefaultMetadata(),
      };
    }
  }

  async putNode(userId: string, node: MemoryNode): Promise<void> {
    const filePath = this.getPath(userId, node.path);
    const metaPath = this.getMetaPath(userId, node.path);

    // Ensure parent directory exists
    const parentDir = path.dirname(filePath);
    await fs.mkdir(parentDir, { recursive: true });

    if (node.type === "directory") {
      await fs.mkdir(filePath, { recursive: true });
    } else {
      await fs.writeFile(filePath, node.content ?? "", "utf-8");
    }

    // Save metadata without content
    const metaNode = { ...node, content: undefined };
    await fs.writeFile(metaPath, JSON.stringify(metaNode, null, 2));
  }

  async deleteNode(userId: string, path: string): Promise<void> {
    const filePath = this.getPath(userId, path);
    const metaPath = this.getMetaPath(userId, path);

    try {
      await fs.access(filePath, constants.F_OK);
    } catch {
      throw new PathNotFoundError(path);
    }

    const stats = await fs.stat(filePath);

    if (stats.isDirectory()) {
      await fs.rm(filePath, { recursive: true, force: true });
    } else {
      await fs.unlink(filePath);
    }

    try {
      await fs.unlink(metaPath);
    } catch {
      // Metadata might not exist
    }
  }

  async searchNodes(
    userId: string,
    query: string,
    searchPath?: string
  ): Promise<MemoryNode[]> {
    const basePath = searchPath ?? "/";
    const nodes = await this.listNodes(userId, basePath);
    const results: MemoryNode[] = [];

    for (const node of nodes) {
      if (node.type === "file") {
        if (
          node.name.toLowerCase().includes(query.toLowerCase()) ||
          (node.content && node.content.toLowerCase().includes(query.toLowerCase()))
        ) {
          results.push(node);
        }
      }

      if (node.type === "directory") {
        const childPath =
          basePath === "/" ? `/${node.name}` : `${basePath}/${node.name}`;
        const children = await this.searchNodes(userId, query, childPath);
        results.push(...children);
      }
    }

    return results;
  }

  async loadPalace(userId: string): Promise<MemoryPalace> {
    const palacePath = path.join(getUserBasePath(this.basePath, userId), ".palace.json");

    try {
      const content = await fs.readFile(palacePath, "utf-8");
      return JSON.parse(content) as MemoryPalace;
    } catch {
      // Return empty palace
      return {
        wings: [],
        rootNodes: [],
      };
    }
  }

  async savePalace(userId: string, palace: MemoryPalace): Promise<void> {
    const userPath = getUserBasePath(this.basePath, userId);
    await fs.mkdir(userPath, { recursive: true });

    const palacePath = path.join(userPath, ".palace.json");
    await fs.writeFile(palacePath, JSON.stringify(palace, null, 2));
  }
}
