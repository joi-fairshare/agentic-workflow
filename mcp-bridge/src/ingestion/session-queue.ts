export interface SessionJob {
  sessionId: string;
  filePath: string;
  repo: string;
  pass: "summary" | "detail" | "both";
}

export interface SessionQueueConfig {
  rateMs: number;
  handler: (job: SessionJob) => Promise<void>;
  onError?: (err: Error, job: SessionJob) => void;
}

export interface SessionQueue {
  enqueue(job: SessionJob): void;
  depth(): number;
  stop(): void;
}

export function createSessionQueue(config: SessionQueueConfig): SessionQueue {
  const { rateMs, handler, onError } = config;
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
        // Stop the interval when the queue is drained
        if (buffer.length === 0 && intervalId !== null) {
          clearInterval(intervalId);
          intervalId = null;
        }
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
