---
globs: ["ui/src/**", "ui/__tests__/**"]
---

# UI Rules

## Next.js 15 App Router

This project uses App Router (not Pages). All pages live in `ui/src/app/`:

| Route | File | Purpose |
|-------|------|---------|
| `/` | `app/page.tsx` | Conversation list with pagination |
| `/conversation/[id]` | `app/conversation/[id]/page.tsx` | Message timeline, tasks, diagrams |
| `/memory` | `app/memory/page.tsx` | Memory graph explorer |

Use `Link` from `next/link` for navigation. Use server components where no interactivity is needed. Mark client components with `"use client"` at the top of the file.

## Hook Conventions

All custom hooks use `"use client"` (they call React hooks). Follow these patterns:

```typescript
"use client";
import { useState, useEffect, useCallback, useRef } from "react";

export function useMyHook(param: string) {
  const [data, setData] = useState<MyType | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchData(param);
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [param]);

  useEffect(() => { fetch(); }, [fetch]);

  return { data, loading, error, refetch: fetch };
}
```

- `useCallback` for stable function references passed as deps or props
- `useMemo` for expensive derivations (diagram generation, graph building)
- `useRef` for mutable values that shouldn't trigger re-renders (EventSource instance)

## SSE Subscription Pattern

```typescript
// use-sse.ts
"use client";
export function useSse(onEvent: (event: BridgeEvent) => void) {
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    sourceRef.current = new EventSource("/api/events");
    sourceRef.current.onmessage = (e) => {
      const event = JSON.parse(e.data) as BridgeEvent;
      onEvent(event);
    };
    sourceRef.current.onerror = () => {
      sourceRef.current?.close();
      // Reconnect after delay
    };
    return () => sourceRef.current?.close();
  }, [onEvent]);
}
```

The global `MockEventSource` in `ui/__tests__/setup.ts` replaces `EventSource` for tests — do not instantiate `EventSource` in a way that bypasses this mock.

## API Client (lib/api.ts)

Use the typed fetch wrappers — don't call `fetch()` directly in components or hooks:

```typescript
import { fetchConversations, fetchMessages, fetchTasks } from "../lib/api.js";
import { searchMemory, traverseMemory, assembleContext } from "../lib/memory-api.js";

const conversations = await fetchConversations(limit, offset);
const messages = await fetchMessages(conversationId);
const results = await searchMemory(query, repo, "hybrid", ["message", "decision"]);
```

All wrappers throw on non-2xx responses with the error message from the response body.

## Diagram Generation (lib/diagrams.ts)

Convert message arrays to Mermaid DSL for rendering:

```typescript
import { buildDirectedGraph, buildSequenceDiagram } from "../lib/diagrams.js";

const graph = buildDirectedGraph(messages);      // Mermaid graph: agent → agent edges
const sequence = buildSequenceDiagram(messages); // Mermaid sequence: chronological flow
```

These are pure functions — memoize with `useMemo` when the messages array reference changes:

```typescript
const diagram = useMemo(() => buildDirectedGraph(messages), [messages]);
```

## Component Patterns

- Components in `ui/src/components/` are reusable presentational units
- Pass data down as props; lift state up to the page level
- No inline `fetch()` calls in components — use hooks or pass data via props
- `DiagramRenderer` renders Mermaid DSL strings — pass the output of `buildDirectedGraph()` or `buildSequenceDiagram()` as the `diagram` prop
- `CopyButton` handles clipboard write + transient "Copied!" state internally

## Testing (Vitest + happy-dom)

Tests live in `ui/__tests__/`. The `happy-dom` environment provides a lightweight DOM.

```typescript
// Hook test example
import { renderHook, act } from "@testing-library/react";
import { useMemorySearch } from "../../src/hooks/use-memory-search.js";

vi.mock("../../src/lib/memory-api.js", () => ({
  searchMemory: vi.fn().mockResolvedValue([]),
}));

it("returns empty results on mount", async () => {
  const { result } = renderHook(() => useMemorySearch());
  await act(async () => {});
  expect(result.current.results).toEqual([]);
});
```

Mock `fetch` globally in tests that exercise `lib/api.ts`:
```typescript
global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });
```

Coverage scope: `hooks/**/*.ts` and `lib/**/*.ts` (excluding `types.ts`).
