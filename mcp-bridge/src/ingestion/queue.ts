// mcp-bridge/src/ingestion/queue.ts

export interface BoundedQueueOptions<T> {
  maxSize: number;
  handler: (item: T) => Promise<void>;
  onDrop?: (item: T) => void;
  onError?: (error: unknown) => void;
}

export interface BoundedQueue<T> {
  enqueue(item: T): void;
  depth(): number;
  stop(): void;
}

export function createBoundedQueue<T>(options: BoundedQueueOptions<T>): BoundedQueue<T> {
  const { maxSize, handler, onDrop, onError } = options;
  const buffer: T[] = [];
  let processing = false;
  let stopped = false;

  function drain(): void {
    if (stopped || processing || buffer.length === 0) return;

    processing = true;
    const item = buffer.shift()!;

    handler(item)
      .catch((err) => { onError?.(err); })
      .finally(() => {
        processing = false;
        if (!stopped && buffer.length > 0) {
          setImmediate(drain);
        }
      });
  }

  return {
    enqueue(item) {
      if (stopped) return;

      if (buffer.length >= maxSize) {
        const dropped = buffer.shift()!;
        onDrop?.(dropped);
      }

      buffer.push(item);

      if (!processing) {
        setImmediate(drain);
      }
    },

    depth: () => buffer.length,

    stop() {
      stopped = true;
      buffer.length = 0;
    },
  };
}
