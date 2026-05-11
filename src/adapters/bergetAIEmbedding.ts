import { createEmbedding as createLocalEmbedding } from "./inMemoryVectorStore";

export interface EmbeddingConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  fallbackToLocal?: boolean;
}

interface ModelInfo {
  id: string;
  model_type: string;
  capabilities: { embeddings: boolean };
}

const DEFAULT_BASE_URL = "https://api.berget.ai/v1";
const DEFAULT_MODEL = "intfloat/multilingual-e5-large";

export class BergetAIEmbeddingAdapter {
  private config: EmbeddingConfig;
  private resolvedModel: string | null = null;

  constructor(config?: Partial<EmbeddingConfig>) {
    this.config = {
      baseUrl: DEFAULT_BASE_URL,
      model: DEFAULT_MODEL,
      fallbackToLocal: true,
      ...config,
    };
  }

  private async fetchEmbeddingModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.config.baseUrl}/models`, {
        headers: this.config.apiKey
          ? { Authorization: `Bearer ${this.config.apiKey}` }
          : {},
      });

      if (!response.ok) {
        console.warn(`Failed to fetch models: ${response.status}`);
        return [];
      }

      const data = (await response.json()) as { data: ModelInfo[] };

      return data.data
        .filter(
          (m) =>
            m.model_type === "embedding" && m.capabilities?.embeddings === true
        )
        .map((m) => m.id);
    } catch (err) {
      console.warn("Failed to fetch embedding models:", err);
      return [];
    }
  }

  private async resolveModel(): Promise<string> {
    if (this.resolvedModel) return this.resolvedModel;

    // If user specified a model, use it directly
    if (this.config.model && this.config.model !== DEFAULT_MODEL) {
      this.resolvedModel = this.config.model;
      return this.resolvedModel;
    }

    // Try to fetch available models and find e5 without instruct
    const models = await this.fetchEmbeddingModels();

    // Prefer e5-large without instruct
    const preferred = models.find(
      (m) => m.includes("e5") && !m.includes("instruct")
    );

    this.resolvedModel = preferred ?? this.config.model ?? DEFAULT_MODEL;
    console.log(`Using embedding model: ${this.resolvedModel}`);

    return this.resolvedModel;
  }

  async createEmbedding(text: string): Promise<number[]> {
    if (!this.config.apiKey) {
      if (this.config.fallbackToLocal) {
        console.warn("No EMBEDDING_API_KEY set, using local TF-IDF fallback");
        return createLocalEmbedding(text, 1024);
      }
      throw new Error("EMBEDDING_API_KEY not configured and fallback disabled");
    }

    try {
      const model = await this.resolveModel();

      const response = await fetch(`${this.config.baseUrl}/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model,
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
        return createLocalEmbedding(text, 1024);
      }

      throw error;
    }
  }

  isConfigured(): boolean {
    return !!this.config.apiKey;
  }
}
