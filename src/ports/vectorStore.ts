export interface VectorDocument {
  id: string;
  path: string;
  content: string;
  embedding: number[];
  metadata: Record<string, unknown>;
}

export interface VectorSearchResult {
  id: string;
  path: string;
  content: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface VectorStorePort {
  addDocument(doc: VectorDocument): Promise<void>;
  addDocuments(docs: VectorDocument[]): Promise<void>;
  search(query: number[], limit?: number): Promise<VectorSearchResult[]>;
  deleteByPath(path: string): Promise<void>;
  clear(): Promise<void>;
}
