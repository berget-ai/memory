import MiniSearch from "minisearch";
import type { StoragePort } from "../ports/storage";
import type { MemoryNode } from "../domain/memory";

interface SearchDocument {
  id: string;
  path: string;
  content: string;
  tags: string[];
  type: string;
}

export class SearchEngine {
  private miniSearch: MiniSearch<SearchDocument>;
  private indexedPaths: Set<string> = new Set();

  constructor() {
    this.miniSearch = new MiniSearch({
      fields: ["content", "path", "tags"],
      storeFields: ["path", "content", "tags", "type"],
      searchOptions: {
        boost: { path: 2, tags: 3 },
        fuzzy: 0.2,
        prefix: true,
      },
    });
  }

  indexNode(node: MemoryNode): void {
    // Remove old document if it exists
    if (this.indexedPaths.has(node.path)) {
      this.miniSearch.remove({ id: node.path } as SearchDocument);
    }

    const doc: SearchDocument = {
      id: node.path,
      path: node.path,
      content: node.content ?? "",
      tags: node.metadata.tags,
      type: node.type,
    };

    this.miniSearch.add(doc);
    this.indexedPaths.add(node.path);
  }

  search(query: string, limit: number = 20): Array<{ path: string; score: number; match: string }> {
    if (this.indexedPaths.size === 0) {
      return [];
    }

    const results = this.miniSearch.search(query, { prefix: true, fuzzy: 0.2 });
    return results.slice(0, limit).map((r) => ({
      path: r.path,
      score: r.score,
      match: r.match?.content?.[0] ?? r.match?.path?.[0] ?? "",
    }));
  }

  async rebuildIndex(storage: StoragePort, userId: string, path?: string): Promise<number> {
    this.miniSearch.removeAll();
    this.indexedPaths.clear();

    const nodes = path
      ? await storage.searchNodes(userId, "", path)
      : await storage.searchNodes(userId, "");

    const docs: SearchDocument[] = nodes
      .filter((n) => n.type === "file")
      .map((n) => ({
        id: n.path,
        path: n.path,
        content: n.content ?? "",
        tags: n.metadata.tags,
        type: n.type,
      }));

    this.miniSearch.addAll(docs);
    for (const doc of docs) {
      this.indexedPaths.add(doc.path);
    }

    return docs.length;
  }
}
