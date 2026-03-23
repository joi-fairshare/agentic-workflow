// ── Event types ───────────────────────────────────────────

export type BridgeEvent =
  | { type: "message:created"; data: { id: string; conversation: string } }
  | { type: "task:created"; data: { id: string; conversation: string } }
  | { type: "task:updated"; data: { id: string; conversation: string; status: string } }
  | { type: "memory:ingestion_dropped"; data: { reason: string } }
  | { type: "memory:session_ingested"; data: { id: string; repo: string; sessionId: string } };

export type EventHandler = (event: BridgeEvent) => void;

// ── EventBus interface ────────────────────────────────────

export interface EventBus {
  emit(event: BridgeEvent): void;
  subscribe(handler: EventHandler): () => void;
}

// ── Factory ───────────────────────────────────────────────

export function createEventBus(): EventBus {
  const handlers = new Set<EventHandler>();

  return {
    emit(event) {
      for (const handler of handlers) {
        handler(event);
      }
    },

    subscribe(handler) {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
  };
}
