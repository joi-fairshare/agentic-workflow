import { vi } from "vitest";

// Mock fetch globally
global.fetch = vi.fn();

// Mock EventSource
class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  listeners: Record<string, ((e: MessageEvent) => void)[]> = {};
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (e: MessageEvent) => void) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(listener);
  }

  removeEventListener(type: string, listener: (e: MessageEvent) => void) {
    const arr = this.listeners[type];
    if (arr) this.listeners[type] = arr.filter(l => l !== listener);
  }

  close() {}

  // Test helper: simulate an event
  _emit(type: string, data: unknown) {
    for (const listener of this.listeners[type] ?? []) {
      listener(new MessageEvent(type, { data: JSON.stringify(data) }));
    }
  }
}

(global as Record<string, unknown>).EventSource = MockEventSource;
export { MockEventSource };
