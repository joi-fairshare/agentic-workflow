---
globs: ["ui/src/**", "ui/__tests__/**"]
---

# UI Rules

## Next.js 15 App Router

This project uses App Router (not Pages). All pages live in `ui/src/app/`:

| Route | File | Purpose |
|-------|------|---------|
| `/` | `app/page.tsx` | Conversation list with pagination |
| `/conversation/[id]` | `app/conversation/[id]/layout.tsx` | Shared layout with Timeline/Graph tab nav |
| `/conversation/[id]` | `app/conversation/[id]/page.tsx` | Timeline tab: messages, tasks, diagrams |
| `/conversation/[id]/graph` | `app/conversation/[id]/graph/page.tsx` | Graph tab: React Flow DAG of memory nodes |
| `/memory` | `app/memory/page.tsx` | Memory Explorer shell (delegates to components) |

`app/conversation/[id]/layout.tsx` renders the `NavHeader` and the Timeline/Graph tab switcher. Both tabs share the same conversation data fetched in the layout.

The `NavHeader` component (`components/nav-header.tsx`) provides top-level navigation between Conversations and Memory Explorer. Include it in root layout — it's already wired into `app/layout.tsx`.

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

## Context Assembly Hook (useContextAssembler)

`useContextAssembler` manages the `tokenBudget` state alongside async context assembly. It differs from search/traverse hooks in that it exposes explicit state for the budget and a `clearContext()` teardown:

```typescript
const {
  context,           // ContextResponse | null
  contextLoading,    // boolean
  tokenBudget,       // number (default 4000)
  setTokenBudget,    // (budget: number) => void
  assembleContext,   // (query: string, repo: string) => Promise<void>
  clearContext,      // () => void
  error,             // string | null
} = useContextAssembler();
```

- `setTokenBudget` updates the budget before calling `assembleContext` — the budget is captured in the `assembleContext` callback via `useCallback([tokenBudget])`
- `clearContext()` resets both `context` and `error` — call it when navigating away or switching repos
- The hook does **not** auto-fetch on mount; `assembleContext(query, repo)` must be called explicitly

## React Flow Graph System

The graph visualization uses [React Flow](https://reactflow.dev/) with a Dagre hierarchical layout (`@dagrejs/dagre`). Key components:

| Component | Location | Purpose |
|-----------|----------|---------|
| `GraphCanvas` | `components/graph/graph-canvas.tsx` | React Flow wrapper, calls `useGraphLayout` |
| `GraphToolbar` | `components/graph/graph-toolbar.tsx` | Depth/direction/edge-kind/sender filters |
| `NodeDetailPanel` | `components/graph/node-detail-panel.tsx` | Selected node metadata + edges |
| `ContextBuilderPanel` | `components/graph/context-builder-panel.tsx` | Token-budgeted context assembly UI |
| `GraphMinimap` | `components/graph/graph-minimap.tsx` | React Flow minimap overlay |
| `PathReplay` | `components/graph/path-replay.tsx` | Play/pause/step/speed controls for traversal replay |
| `node-types/` | `components/graph/node-types/` | 6 typed node renderers (message, conversation, topic, decision, task, artifact) |

**Layout hook**: `useGraphLayout(nodes, edges)` — applies Dagre layout and returns positioned React Flow nodes. Handles cycle-prone edge kinds by routing them outside Dagre. Call `useMemo` around the input arrays to prevent layout thrashing.

**Edge styles**: `components/graph/edge-styles.ts` exports `EDGE_COLOR_MAP` and `EDGE_DASH_MAP` — 10 edge kinds each have a distinct color and dash pattern. Use these constants in node type renderers and the toolbar legend.

**Conversation graph page**: `components/conversation-graph/conversation-graph-page.tsx` — wraps the graph canvas with a `ConversationNodeList` sidebar for click-to-focus navigation.

**Memory Explorer**: Three-column layout (`components/memory-explorer/`):
- `MemorySearchPanel` — left column: search input, results list, mode selector
- `GraphCanvas` — center: React Flow graph of traversal results
- `TraversalLogPanel` — right column: recent traversal logs from `GET /memory/traversal-logs`

## Graph Hooks

```typescript
// Dagre layout for React Flow
import { useGraphLayout } from "../hooks/use-graph-layout.js";
const { nodes: layoutNodes, edges: layoutEdges } = useGraphLayout(rawNodes, rawEdges);

// Traversal path replay
import { usePathReplay } from "../hooks/use-path-replay.js";
const { step, isPlaying, play, pause, stepForward, stepBack, setSpeed } = usePathReplay(traversalSteps);

// Traversal log fetching
import { useTraversalLogs } from "../hooks/use-traversal-logs.js";
const { logs, loading, error } = useTraversalLogs(repo, limit);
```

`usePathReplay` manages a cursor over `TraversalStep[]` and exposes playback controls. Speed is a multiplier (0.5×, 1×, 2×, 4×). The hook does not auto-start — call `play()` explicitly.

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
