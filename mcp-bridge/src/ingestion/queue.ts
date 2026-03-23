// mcp-bridge/src/ingestion/queue.ts

export interface AsyncQueueOptions<T> {
  handler: (item: T) => Promise<void>;
  onError?: (error: unknown) => void;
}

export interface AsyncQueue<T> {
  enqueue(item: T): void;
  depth(): number;
  stop(): void;
}

export function createAsyncQueue<T>(options: AsyncQueueOptions<T>): AsyncQueue<T> {
  const { handler, onError } = options;
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
