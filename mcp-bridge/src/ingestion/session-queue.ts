export interface SessionJob {
  sessionId: string;
  filePath: string;
  repo: string;
  pass: "summary" | "detail" | "both";
}

export interface SessionQueueConfig {
  maxSize: number;
  rateMs: number;
  handler: (job: SessionJob) => Promise<void>;
  onDrop?: (job: SessionJob) => void;
  onError?: (err: Error, job: SessionJob) => void;
}

export interface SessionQueue {
  enqueue(job: SessionJob): void;
  depth(): number;
  stop(): void;
}

export function createSessionQueue(config: SessionQueueConfig): SessionQueue {
  const { maxSize, rateMs, handler, onDrop, onError } = config;
  const buffer: SessionJob[] = [];
  let stopped = false;
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let processing = false;

  function processNext(): void {
    if (stopped || buffer.length === 0 || processing) return;

    processing = true;
    const job = buffer.shift()!;

    handler(job)
      .catch((err) => {
        onError?.(err instanceof Error ? err : new Error(String(err)), job);
      })
      .finally(() => {
        processing = false;
      });
  }

  function startInterval(): void {
    if (intervalId === null && !stopped) {
      intervalId = setInterval(processNext, rateMs);
    }
  }

  return {
    enqueue(job) {
      if (stopped) return;

      if (buffer.length >= maxSize) {
        const dropped = buffer.shift()!;
        onDrop?.(dropped);
      }

      buffer.push(job);
      startInterval();
    },

    depth: () => buffer.length,

    stop() {
      stopped = true;
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    },
  };
}
