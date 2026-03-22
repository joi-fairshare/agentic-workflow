# Interactive DAG Visualization for Conversation Memory Graph

**Issue:** #7
**Date:** 2026-03-22
**Status:** Draft

## Overview

Add an interactive graph visualization that lets humans see and explore the same DAG that agents crawl via `traverse_memory`, `search_memory`, and `get_context`. Two new pages with distinct purposes, powered by React Flow with Dagre layout.

## Pages

### 1. Conversation Memory Graph (`/conversation/[id]/graph`)

Visualize a single conversation's memory subgraph — how messages, tasks, topics, decisions, and artifacts connect.

**Layout:** Three-column.
- **Left panel:** Node list filtered by kind, sorted by timestamp. Click to select and center in graph.
- **Center:** Interactive DAG (React Flow + Dagre hierarchical layout). Minimap in corner. Toolbar with depth slider, direction toggle, edge kind filter.
- **Right panel (top):** Selected node detail — title, body, metadata, edge list (in/out), timestamps.
- **Right panel (bottom):** Context builder — assemble context for this conversation, token budget bar, section breakdown with relevance scores, included nodes highlighted in graph with gold dashed rings.

**Entry point:** New "Graph" tab on the existing `/conversation/[id]` page, alongside the Timeline view.

### 2. Cross-Conversation Memory Explorer (`/memory` — enhanced)

Search, traverse, and explore the full memory graph across all conversations.

**Layout:** Three-column.
- **Left panel (top):** Search input, mode selector (keyword/semantic/hybrid), kind filters. Results as a scored list with match type badges (K/S/H).
- **Left panel (bottom):** Traversal log — list of recorded agent traversals. Click to load and replay.
- **Center:** Interactive graph (React Flow + Dagre). Search results highlighted with score badges. Click-to-traverse from any node.
- **Right panel (top):** Selected node detail with RRF score and match type when from search.
- **Right panel (bottom):** Context builder — assemble from query or selected node.

**Replaces:** Current Memory Explorer page (which is non-functional — see issue #18).

### Navigation

Add a header nav bar to the existing layout with links:
- **Conversations** (`/`)
- **Memory Explorer** (`/memory`)

## Visual Language

### Node Kinds

Each node kind is a custom React Flow component with distinct color and silhouette SVG icon (no emojis).

| Kind | Color | Shape | Displays |
|------|-------|-------|----------|
| `message` | Blue (#3B82F6) | Rounded rect | sender → recipient, truncated payload, timestamp |
| `conversation` | Purple (#7C6AF5) | Larger rounded rect | Conversation ID (truncated), message count, agent count |
| `topic` | Green (#10B981) | Rounded rect | Topic title, related conversation count |
| `decision` | Amber (#F59E0B) | Diamond | Decision title |
| `task` | Red (#EF4444) | Rounded rect + status badge | Task summary, status (pending/in_progress/completed/failed), assigned agent |
| `artifact` | Violet (#8B5CF6) | Rounded rect | Artifact title, type from metadata |

**Interactive states:**
- **Default:** Background at 0.15 opacity, 1px border at 0.4 opacity
- **Hover:** Background at 0.25, 2px border at 0.7, subtle glow shadow
- **Selected:** Background at 0.3, 2px solid border, stronger glow, populates detail panel

### Edge Kinds

Edges are labeled arrows with color and line style conveying relationship type.

| Kind | Color | Style | Category |
|------|-------|-------|----------|
| `contains` | Purple (#7C6AF5) | Solid | Structural |
| `spawned` | Blue (#3B82F6) | Dashed | Creation |
| `assigned_in` | Red (#EF4444) | Solid | Structural |
| `reply_to` | Blue (#3B82F6) | Dotted | Communication |
| `led_to` | Amber (#F59E0B) | Solid | Causal |
| `discussed_in` | Green (#10B981) | Solid | Contextual |
| `decided_in` | Amber (#F59E0B) | Solid | Contextual |
| `implemented_by` | Violet (#8B5CF6) | Solid | Causal |
| `references` | Gray (rgba 0.3) | Dashed | Weak |
| `related_to` | Gray (rgba 0.3) | Dotted | Weak |

## Feature Capabilities

### 1. Interactive Graph Explorer

Both pages share these capabilities via the graph toolbar:

- **Click-to-traverse:** Click any node to expand its edges (fetches via `/memory/node/:id/edges` and `/memory/traverse/:id`)
- **Direction toggle:** Outgoing / incoming / both edges
- **Edge kind filter:** Checkboxes to show/hide each of the 10 edge types
- **Depth control:** Slider from 1-5 hops
- **Node kind coloring:** Automatic per the visual language above
- **Zoom/pan:** React Flow built-in
- **Minimap:** React Flow MiniMap with node-kind coloring

### 2. Search → Graph Integration (Memory Explorer page)

- Search results appear as highlighted nodes in the graph with their connected edges
- Each result node gets a **score badge** (floating label showing RRF fusion score)
- **Match type indicator:** `K` (keyword), `S` (semantic), `H` (hybrid) badge on each result
- Non-result connected nodes render at reduced opacity (0.4)
- Clicking a result in the left panel centers the graph on that node

### 3. Context Assembly Visualization (Both pages)

- "Assemble Context" button triggers `/memory/context` API
- Included nodes get a **gold dashed border ring** in the graph
- Excluded nodes dim to 0.3 opacity
- Right panel shows:
  - Token budget bar (used / total) with gradient fill
  - Sections list: heading, relevance score bar, token estimate
  - Click a section → highlights its source nodes in graph
- Legend distinguishes "in context" (gold ring) vs "excluded" (dimmed)

**API change required:** The existing `ContextSection` response shape (`heading`, `content`, `relevance`, `token_estimate`) does not include node IDs, making it impossible to map sections back to graph nodes. The `ContextSectionSchema` must be extended with a `node_ids: string[]` field that lists which memory node IDs contributed to each section. The `assembleContext` service already has this information internally — it just needs to include it in the response.

### 4. Agent Path Replay (Memory Explorer page)

- Traversal log panel lists recorded agent traversals (agent name, operation, start node, depth, timestamp)
- Click a log entry → graph loads that traversal's subgraph
- Playback controls: play/pause, step forward/back, speed slider (0.5x - 3x)
- Animation: nodes light up in BFS visit order with numbered step indicators
  - Visited nodes: green (#10B981) glow border with step number badge
  - Current node: pulsing animated ring
  - Pending nodes: dimmed at 0.25 opacity
  - Edges glow green as they're followed
- Right panel shows during replay:
  - Traversal params (agent, operation, direction, depth, edge_kinds)
  - Current node detail with "reached via [edge_kind] from [parent]"
  - Full visit order list — completed steps shown, current highlighted, pending grayed
- For context operations: final state shows gold rings on nodes that made it into the context window vs dimmed for visited-but-excluded

## Backend Changes

### Traversal Logging

New `traversal_logs` table in `memory-schema.ts`:

```sql
CREATE TABLE IF NOT EXISTS traversal_logs (
  id TEXT PRIMARY KEY,
  repo TEXT NOT NULL,
  agent TEXT NOT NULL,
  operation TEXT NOT NULL CHECK(operation IN ('traverse', 'context')),
  start_node TEXT,             -- nullable: SET NULL on node deletion preserves log history
  params TEXT NOT NULL,       -- JSON: direction, max_depth, edge_kinds, query, token_budget
  steps TEXT NOT NULL,          -- JSON array of {node_id, parent_id, edge_id, edge_kind}
  scores TEXT,                 -- JSON: node_id → relevance score (context ops only)
  token_allocation TEXT,       -- JSON: section → tokens (context ops only)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (start_node) REFERENCES nodes(id) ON DELETE SET NULL
);
CREATE INDEX idx_traversal_logs_repo ON traversal_logs(repo);
CREATE INDEX idx_traversal_logs_created ON traversal_logs(created_at);
```

**Data shape (TypeScript):**

```typescript
interface TraversalLog {
  id: string;
  repo: string;
  agent: string;
  operation: "traverse" | "context";
  start_node: string | null;
  params: {
    direction?: string;
    max_depth?: number;
    edge_kinds?: string[];
    query?: string;
    token_budget?: number;
  };
  steps: Array<{
    node_id: string;
    parent_id: string | null;  // null for start node
    edge_id: string | null;    // null for start node
    edge_kind: string | null;  // null for start node
  }>;
  scores?: Record<string, number>;
  token_allocation?: Record<string, number>;
  created_at: string;
}
```

### New Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/memory/traversals?repo=X` | List recent traversal logs |
| `GET` | `/memory/traversal/:id` | Get a specific traversal with full path data |

### Service Changes

- `traverseMemory` — records BFS steps (node/parent/edge tuples in visit order) and writes a `traversal_log` after completing
- `assembleContext` — records which nodes were selected, relevance scores, and token budget allocation; writes a `traversal_log` with `operation: "context"`
- Both services accept an optional `agent` parameter to identify who triggered the traversal

**Agent identity flow:**
- **REST API:** New optional `agent` query parameter on `GET /memory/traverse/:id` and `GET /memory/context`. Defaults to `"anonymous"` if omitted. The UI passes `"ui-user"` when a human triggers traversal/context from the browser.
- **MCP tools:** The `traverse_memory` and `get_context` MCP tool schemas gain an optional `agent` string field. Claude Code sessions pass their agent identifier (e.g. `"claude-code"`, `"codex"`). This is the primary source of real agent names.
- **Service layer:** `TraverseInput` and `AssembleContextInput` types gain `agent?: string`. Services pass this through to `insertTraversalLog`.

### MemoryDbClient Additions

- `insertTraversalLog(log)` — insert a traversal log entry
- `getTraversalLogs(repo, limit?)` — list recent logs for a repo
- `getTraversalLog(id)` — get a single log by ID

## Component Architecture

### Shared Components (`ui/src/components/graph/`)

```
graph/
├── graph-canvas.tsx          # React Flow wrapper — nodes/edges, Dagre layout
├── graph-toolbar.tsx         # Depth slider, direction toggle, edge kind filters
├── graph-minimap.tsx         # React Flow MiniMap with node-kind coloring
├── node-types/
│   ├── message-node.tsx      # Blue rounded rect
│   ├── conversation-node.tsx # Purple larger rect
│   ├── topic-node.tsx        # Green rounded rect
│   ├── decision-node.tsx     # Amber diamond
│   ├── task-node.tsx         # Red rounded rect + status badge
│   └── artifact-node.tsx     # Violet rounded rect
├── edge-styles.ts            # Edge color/dash config per edge kind
├── node-detail-panel.tsx     # Selected node info, edge list
├── context-builder-panel.tsx # Context assembly UI
└── path-replay.tsx           # Traversal replay controls
```

### Page-Specific Components

```
components/
├── conversation-graph/
│   ├── conversation-graph-page.tsx  # /conversation/[id]/graph layout
│   └── conversation-node-list.tsx   # Left panel node list
└── memory-explorer/
    ├── memory-explorer-page.tsx     # /memory layout (replaces current)
    ├── memory-search-panel.tsx      # Search input, mode, filters, results
    └── traversal-log-panel.tsx      # Recorded traversal list
```

### New Hooks (`ui/src/hooks/`)

```
├── use-graph-layout.ts      # Dagre layout computation → positioned nodes/edges
├── use-traversal-logs.ts    # Fetch/manage traversal log list
└── use-path-replay.ts       # Replay state machine — step, timer, highlighted set
```

### Data Flow

1. Page fetches data (traverse API for conversation graph, search API for memory explorer)
2. Response nodes/edges → `use-graph-layout` → Dagre computes positions → React Flow renders
3. Click node → detail panel updates, optionally triggers further traversal to expand
4. Search results → matched nodes highlighted with glow + score badges, non-matches dimmed
5. Context assembly → gold dashed rings on included nodes, token budget in panel
6. Path replay → `use-path-replay` steps through `traversal_log.path`, highlighting each node/edge in BFS sequence with animation

## New Dependencies

| Package | Purpose |
|---------|---------|
| `@xyflow/react` | React Flow v12 — interactive graph canvas |
| `@dagrejs/dagre` | Hierarchical DAG layout algorithm |

## Testing Strategy

- **Unit tests:** Custom node components render correctly with each kind's props
- **Hook tests:** `use-graph-layout` produces valid positioned output from raw nodes/edges; `use-path-replay` state machine transitions correctly
- **Integration tests:** Graph canvas renders with mock data; search highlighting applies correct styles; context assembly gold rings appear on correct nodes
- **Backend tests:** `traversal_logs` CRUD operations; traversal logging records correct path during BFS; context assembly logging records scores and token allocation
- **Coverage:** 100% threshold per project merge gate

## Existing Issues to Fix

Issue #18 documents three bugs that block this feature:
1. No navigation to Memory Explorer (no header nav)
2. Memory API endpoints return 404 (stale build)
3. Memory Explorer shows nothing by default

These are prerequisites — the nav bar addition and build fix will be addressed as part of this implementation.
