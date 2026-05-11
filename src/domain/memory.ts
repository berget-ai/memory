export interface MemoryNode {
  id: string;
  path: string;
  name: string;
  type: "file" | "directory";
  content?: string;
  metadata: MemoryMetadata;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryMetadata {
  tags: string[];
  importance: number;
  category?: string;
  references: string[];
  embeddingId?: string;
}

export interface MemoryPath {
  segments: string[];
  absolute: string;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  currentPath: string;
}

export interface SessionContext {
  userId: string;
  currentPath: string;
  palace: MemoryPalace;
}

export interface MemoryPalace {
  wings: Wing[];
  rootNodes: MemoryNode[];
}

export interface Wing {
  id: string;
  name: string;
  description: string;
  rooms: Room[];
}

export interface Room {
  id: string;
  name: string;
  drawers: Drawer[];
}

export interface Drawer {
  id: string;
  name: string;
  content: string;
  metadata: MemoryMetadata;
}
