export type MemoryEventType =
  | "node.created"
  | "node.updated"
  | "node.deleted"
  | "node.tagged"
  | "node.indexed"
  | "palace.changed";

export interface MemoryEvent {
  id: string;
  type: MemoryEventType;
  userId: string;
  path: string;
  nodeType: "file" | "directory";
  timestamp: string;
  metadata?: {
    tags?: string[];
    importance?: number;
    size?: number;
    action?: string;
  };
}

export interface EventFilter {
  types?: MemoryEventType[];
  pathPrefix?: string;
  nodeType?: "file" | "directory";
  tags?: string[];
}

export function matchesFilter(event: MemoryEvent, filter: EventFilter): boolean {
  if (filter.types && !filter.types.includes(event.type)) {
    return false;
  }

  if (filter.pathPrefix && !event.path.startsWith(filter.pathPrefix)) {
    return false;
  }

  if (filter.nodeType && event.nodeType !== filter.nodeType) {
    return false;
  }

  if (filter.tags && filter.tags.length > 0) {
    const eventTags = event.metadata?.tags ?? [];
    const hasMatchingTag = filter.tags.some((tag) => eventTags.includes(tag));
    if (!hasMatchingTag) {
      return false;
    }
  }

  return true;
}
