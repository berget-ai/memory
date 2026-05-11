import type { StoragePort } from "../src/ports/storage";
import type { AuthPort } from "../src/ports/auth";
import type { VectorStorePort, VectorDocument, VectorSearchResult } from "../src/ports/vectorStore";
import type { MemoryNode, MemoryPalace } from "../src/domain/memory";

export class MockStorageAdapter implements StoragePort {
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
          const isDir = relPath.includes("/");
          const childPath = path.replace(/\/$/, "") + "/" + firstSegment;
          
          // Try to get actual node, or create a directory node
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
    return this.store.get(this.key(userId, path)) ?? null;
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
      
      // Search in both path and content
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
    // Mock implementation
  }
}

export class MockAuthAdapter implements AuthPort {
  async verifyToken(token: string) {
    if (token === "invalid") {
      throw new Error("Invalid token");
    }
    return {
      sub: "test-user-123",
      preferred_username: "testuser",
      email: "test@example.com",
    };
  }
}

export class MockVectorStore implements VectorStorePort {
  private documents: Map<string, VectorDocument> = new Map();

  async addDocument(doc: VectorDocument): Promise<void> {
    this.documents.set(doc.id, doc);
  }

  async addDocuments(docs: VectorDocument[]): Promise<void> {
    for (const doc of docs) {
      this.documents.set(doc.id, doc);
    }
  }

  async search(query: number[], limit: number = 10): Promise<VectorSearchResult[]> {
    const results: VectorSearchResult[] = [];

    for (const doc of this.documents.values()) {
      // Simple dot product for testing
      let score = 0;
      for (let i = 0; i < Math.min(query.length, doc.embedding.length); i++) {
        score += query[i] * doc.embedding[i];
      }

      if (score > 0.01) {
        results.push({
          id: doc.id,
          path: doc.path,
          content: doc.content,
          score,
          metadata: doc.metadata,
        });
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  async deleteByPath(path: string): Promise<void> {
    for (const [id, doc] of this.documents) {
      if (doc.path === path) {
        this.documents.delete(id);
      }
    }
  }

  async clear(): Promise<void> {
    this.documents.clear();
  }
}
