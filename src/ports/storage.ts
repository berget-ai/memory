import type { MemoryNode, MemoryPalace } from "../domain/memory";

export interface StoragePort {
  listNodes(userId: string, path: string): Promise<MemoryNode[]>;
  getNode(userId: string, path: string): Promise<MemoryNode | null>;
  putNode(userId: string, node: MemoryNode): Promise<void>;
  deleteNode(userId: string, path: string): Promise<void>;
  searchNodes(userId: string, pattern: string, path?: string): Promise<MemoryNode[]>;
  loadPalace(userId: string): Promise<MemoryPalace>;
  savePalace(userId: string, palace: MemoryPalace): Promise<void>;
}
