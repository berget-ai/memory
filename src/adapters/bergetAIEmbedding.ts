import { createEmbedding as createLocalEmbedding } from "./inMemoryVectorStore";

export interface EmbeddingConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  fallbackToLocal?: boolean;
}

const DEFAULT_CONFIG: EmbeddingConfig = {
  baseUrl: "https://api.berget.ai/v1",
  model: "text-embedding-3-small",
  fallbackToLocal: true,
};

export class BergetAIEmbeddingAdapter {
  private config: EmbeddingConfig;

  constructor(config?: Partial<EmbeddingConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async createEmbedding(text: string): Promise<number[]> {
    // If no API key configured, use local fallback
    if (!this.config.apiKey) {
      if (this.config.fallbackToLocal) {
        console.warn("No EMBEDDING_API_KEY set, using local TF-IDF embedding fallback");
        return createLocalEmbedding(text, 1536);
      }
      throw new Error("EMBEDDING_API_KEY not configured and fallback disabled");
    }

    try {
      const response = await fetch(`${this.config.baseUrl}/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          input: text,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Embedding API error: ${response.status} ${error}`);
      }

      const data = (await response.json()) as {
        data: Array<{ embedding: number[] }>;
      };

      return data.data[0]?.embedding ?? [];
    } catch (error) {
      console.error("Failed to generate embedding via API:", error);

      if (this.config.fallbackToLocal) {
        console.warn("Falling back to local TF-IDF embedding");
        return createLocalEmbedding(text, 1536);
      }

      throw error;
    }
  }

  isConfigured(): boolean {
    return !!this.config.apiKey;
  }
}
