import type { MemoryEvent, EventFilter } from "../domain/events";
import { matchesFilter } from "../domain/events";

interface Subscriber {
  id: string;
  userId: string;
  filter: EventFilter;
  send: (event: MemoryEvent) => void;
}

export class MemoryEventBus {
  private subscribers: Map<string, Subscriber> = new Map();
  private counter = 0;

  subscribe(userId: string, filter: EventFilter, send: (event: MemoryEvent) => void): string {
    const id = `sub-${++this.counter}`;
    this.subscribers.set(id, { id, userId, filter, send });
    return id;
  }

  unsubscribe(id: string): void {
    this.subscribers.delete(id);
  }

  emit(event: MemoryEvent): void {
    for (const sub of this.subscribers.values()) {
      if (sub.userId !== event.userId) continue;
      if (matchesFilter(event, sub.filter)) {
        try {
          sub.send(event);
        } catch {
          // Subscriber disconnected, clean up
          this.subscribers.delete(sub.id);
        }
      }
    }
  }

  getSubscriberCount(userId?: string): number {
    if (!userId) return this.subscribers.size;
    return Array.from(this.subscribers.values()).filter((s) => s.userId === userId).length;
  }
}

// Singleton instance
export const globalEventBus = new MemoryEventBus();
