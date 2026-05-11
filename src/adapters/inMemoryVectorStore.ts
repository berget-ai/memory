import type { VectorStorePort, VectorDocument, VectorSearchResult } from "../ports/vectorStore";

function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Simple TF-IDF-like embedding for demo purposes
// In production, use a real embedding model like OpenAI, Cohere, or local models
export function createEmbedding(text: string, dimensions: number = 384): number[] {
  const vector = new Array(dimensions).fill(0);
  const words = text.toLowerCase().split(/\s+/);

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    for (let j = 0; j < word.length; j++) {
      const charCode = word.charCodeAt(j);
      const idx = (charCode + i * 31 + j * 17) % dimensions;
      vector[idx] += 1;
    }
  }

  // Normalize
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  return norm > 0 ? vector.map((v) => v / norm) : vector;
}

export class InMemoryVectorStore implements VectorStorePort {
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
      const score = cosineSimilarity(query, doc.embedding);
      if (score > 0.1) {
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

  getCount(): number {
    return this.documents.size;
  }
}
