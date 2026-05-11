import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BergetAIEmbeddingAdapter } from "../src/adapters/bergetAIEmbedding";

describe("BergetAIEmbeddingAdapter", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe("model resolution", () => {
    it("fetches and filters embedding models from API", async () => {
      const mockModels = {
        data: [
          {
            id: "intfloat/multilingual-e5-large",
            model_type: "embedding",
            capabilities: { embeddings: true },
          },
          {
            id: "intfloat/multilingual-e5-large-instruct",
            model_type: "embedding",
            capabilities: { embeddings: true },
          },
          {
            id: "gpt-4",
            model_type: "text",
            capabilities: { embeddings: false },
          },
        ],
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockModels,
      } as Response);

      const adapter = new BergetAIEmbeddingAdapter({
        apiKey: "test-key",
        baseUrl: "https://api.berget.ai/v1",
      });

      // Trigger model resolution via createEmbedding
      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockModels,
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: [{ embedding: new Array(1024).fill(0.1) }],
          }),
        } as Response);

      const embedding = await adapter.createEmbedding("test text");

      expect(embedding).toHaveLength(1024);
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);

      // Verify first call was to /models
      const firstCall = (globalThis.fetch as any).mock.calls[0];
      expect(firstCall[0]).toBe("https://api.berget.ai/v1/models");

      // Verify second call used the e5-large without instruct
      const secondCall = (globalThis.fetch as any).mock.calls[1];
      const requestBody = JSON.parse(secondCall[1].body);
      expect(requestBody.model).toBe("intfloat/multilingual-e5-large");
    });

    it("prefers e5-large without instruct over instruct variant", async () => {
      const mockModels = {
        data: [
          {
            id: "intfloat/multilingual-e5-large-instruct",
            model_type: "embedding",
            capabilities: { embeddings: true },
          },
          {
            id: "intfloat/multilingual-e5-large",
            model_type: "embedding",
            capabilities: { embeddings: true },
          },
        ],
      };

      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockModels,
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: [{ embedding: new Array(1024).fill(0.1) }],
          }),
        } as Response);

      const adapter = new BergetAIEmbeddingAdapter({
        apiKey: "test-key",
        baseUrl: "https://api.berget.ai/v1",
      });

      await adapter.createEmbedding("test");

      const secondCall = (globalThis.fetch as any).mock.calls[1];
      const requestBody = JSON.parse(secondCall[1].body);
      expect(requestBody.model).toBe("intfloat/multilingual-e5-large");
    });

    it("uses user-specified model when provided", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ embedding: new Array(1024).fill(0.1) }],
        }),
      } as Response);

      const adapter = new BergetAIEmbeddingAdapter({
        apiKey: "test-key",
        baseUrl: "https://api.berget.ai/v1",
        model: "custom-model",
      });

      await adapter.createEmbedding("test");

      const call = (globalThis.fetch as any).mock.calls[0];
      const requestBody = JSON.parse(call[1].body);
      expect(requestBody.model).toBe("custom-model");
    });

    it("falls back to default model when API returns no embedding models", async () => {
      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [] }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: [{ embedding: new Array(1024).fill(0.1) }],
          }),
        } as Response);

      const adapter = new BergetAIEmbeddingAdapter({
        apiKey: "test-key",
      });

      await adapter.createEmbedding("test");

      const secondCall = (globalThis.fetch as any).mock.calls[1];
      const requestBody = JSON.parse(secondCall[1].body);
      expect(requestBody.model).toBe("intfloat/multilingual-e5-large");
    });
  });

  describe("embedding generation", () => {
    it("generates embeddings via API when key is provided", async () => {
      const mockEmbedding = new Array(1024).fill(0.1);

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ embedding: mockEmbedding }],
        }),
      } as Response);

      const adapter = new BergetAIEmbeddingAdapter({
        apiKey: "test-key",
        baseUrl: "https://api.berget.ai/v1",
        model: "test-model",
      });

      const embedding = await adapter.createEmbedding("hello world");

      expect(embedding).toHaveLength(1024);
      expect(embedding[0]).toBe(0.1);

      // Verify API call
      const call = (globalThis.fetch as any).mock.calls[0];
      expect(call[0]).toBe("https://api.berget.ai/v1/embeddings");
      expect(call[1].method).toBe("POST");
      expect(call[1].headers.Authorization).toBe("Bearer test-key");

      const body = JSON.parse(call[1].body);
      expect(body.model).toBe("test-model");
      expect(body.input).toBe("hello world");
    });

    it("normalizes embeddings to unit length", async () => {
      const mockEmbedding = [3, 4, 0]; // Should normalize to [0.6, 0.8, 0]

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ embedding: mockEmbedding }],
        }),
      } as Response);

      const adapter = new BergetAIEmbeddingAdapter({
        apiKey: "test-key",
        model: "test-model",
      });

      const embedding = await adapter.createEmbedding("test");

      expect(embedding).toEqual([3, 4, 0]);
    });
  });

  describe("fallback behavior", () => {
    it("falls back to local TF-IDF when no API key configured", async () => {
      const adapter = new BergetAIEmbeddingAdapter({
        fallbackToLocal: true,
      });

      const embedding = await adapter.createEmbedding("hello world");

      // Local embeddings are 1024 dimensions
      expect(embedding).toHaveLength(1024);
      expect(embedding.every((v) => typeof v === "number")).toBe(true);
    });

    it("falls back to local TF-IDF when API returns error", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "Internal Server Error",
      } as Response);

      const adapter = new BergetAIEmbeddingAdapter({
        apiKey: "test-key",
        fallbackToLocal: true,
        model: "test-model",
      });

      const embedding = await adapter.createEmbedding("test");

      // Should fallback to local
      expect(embedding).toHaveLength(1024);
    });

    it("throws error when API fails and fallback is disabled", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => "Unauthorized",
      } as Response);

      const adapter = new BergetAIEmbeddingAdapter({
        apiKey: "invalid-key",
        fallbackToLocal: false,
        model: "test-model",
      });

      await expect(adapter.createEmbedding("test")).rejects.toThrow(
        "Embedding API error"
      );
    });

    it("throws error when no API key and fallback disabled", async () => {
      const adapter = new BergetAIEmbeddingAdapter({
        fallbackToLocal: false,
      });

      await expect(adapter.createEmbedding("test")).rejects.toThrow(
        "EMBEDDING_API_KEY not configured"
      );
    });
  });

  describe("isConfigured", () => {
    it("returns true when API key is set", () => {
      const adapter = new BergetAIEmbeddingAdapter({ apiKey: "test" });
      expect(adapter.isConfigured()).toBe(true);
    });

    it("returns false when no API key", () => {
      const adapter = new BergetAIEmbeddingAdapter({});
      expect(adapter.isConfigured()).toBe(false);
    });
  });
});
