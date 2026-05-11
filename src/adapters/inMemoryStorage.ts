import type { StoragePort } from "../ports/storage";
import type { MemoryNode, MemoryPalace } from "../domain/memory";

export class InMemoryStorageAdapter implements StoragePort {
  private store: Map<string, MemoryNode> = new Map();

  private key(userId: string, path: string): string {
    return `${userId}:${path}`;
  }

  async listNodes(userId: string, path: string): Promise<MemoryNode[]> {
    const prefix = this.key(userId, path);
    const nodes: MemoryNode[] = [];
    const seen = new Set<string>();

    for (const [key, node] of this.store) {
      if (key.startsWith(prefix) && key !== prefix) {
        const relPath = node.path.slice(path.length).replace(/^\/+/, "");
        const firstSegment = relPath.split("/")[0];
        
        if (firstSegment && !seen.has(firstSegment)) {
          seen.add(firstSegment);
          const childPath = path.replace(/\/$/, "") + "/" + firstSegment;
          
          const actualNode = this.store.get(this.key(userId, childPath));
          if (actualNode) {
            nodes.push(actualNode);
          } else {
            nodes.push({
              id: childPath,
              path: childPath,
              name: firstSegment,
              type: "directory",
              metadata: {
                tags: [],
                importance: 0.5,
                references: [],
              },
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          }
        }
      }
    }

    return nodes;
  }

  async getNode(userId: string, path: string): Promise<MemoryNode | null> {
    // Check for exact match first
    const exact = this.store.get(this.key(userId, path));
    if (exact) return exact;

    // Check if any child nodes exist (implicit directory)
    const prefix = this.key(userId, path);
    for (const [key] of this.store) {
      if (key.startsWith(prefix + "/")) {
        // Return a virtual directory node
        const segments = path.split("/").filter(Boolean);
        const name = segments[segments.length - 1] || "";
        return {
          id: path,
          path,
          name,
          type: "directory",
          metadata: {
            tags: [],
            importance: 0.5,
            references: [],
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }
    }

    return null;
  }

  async putNode(userId: string, node: MemoryNode): Promise<void> {
    this.store.set(this.key(userId, node.path), { ...node });
  }

  async deleteNode(userId: string, path: string): Promise<void> {
    this.store.delete(this.key(userId, path));
  }

  async searchNodes(
    userId: string,
    pattern: string,
    path?: string
  ): Promise<MemoryNode[]> {
    const nodes: MemoryNode[] = [];
    const lowerPattern = pattern.toLowerCase();
    const seen = new Set<string>();

    for (const [key, node] of this.store) {
      if (!key.startsWith(`${userId}:`)) continue;
      if (path && !node.path.startsWith(path)) continue;
      
      const pathMatch = lowerPattern === "" || node.path.toLowerCase().includes(lowerPattern);
      const contentMatch = node.content?.toLowerCase().includes(lowerPattern);
      
      if (pathMatch || contentMatch) {
        if (!seen.has(node.path)) {
          seen.add(node.path);
          nodes.push(node);
        }
      }
    }

    return nodes;
  }

  async loadPalace(userId: string): Promise<MemoryPalace> {
    const rootNodes: MemoryNode[] = [];
    for (const [key, node] of this.store) {
      if (key.startsWith(`${userId}:`)) {
        rootNodes.push(node);
      }
    }
    return { wings: [], rootNodes };
  }

  async savePalace(userId: string, palace: MemoryPalace): Promise<void> {
    const palaceKey = this.key(userId, ".palace/palace.json");
    this.store.set(palaceKey, {
      id: palaceKey,
      path: "/.palace/palace.json",
      name: "palace.json",
      type: "file",
      content: JSON.stringify(palace, null, 2),
      metadata: { tags: [], importance: 1.0, references: [] },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  // Debug helper
  dump(userId?: string): Record<string, MemoryNode> {
    const result: Record<string, MemoryNode> = {};
    for (const [key, node] of this.store) {
      if (!userId || key.startsWith(`${userId}:`)) {
        result[key] = node;
      }
    }
    return result;
  }
}
