# API Contract -- MCP Bridge

All REST endpoints return a standard envelope:

```jsonc
// Success
{ "ok": true, "data": <response> }

// Error
{ "ok": false, "error": { "code": "<CODE>", "message": "<human-readable>", "details": <optional> } }
```

POST endpoints return **201** on success. GET endpoints return **200** on success.

---

## GET /health

Health check endpoint. Registered directly on the Fastify instance.

### Request

No parameters, no body.

### Response (200)

```json
{ "status": "ok" }
```

**Note:** This endpoint does NOT use the standard `{ ok, data }` envelope -- it returns the object directly.

### Error Cases

| HTTP Status | Code | Meaning |
|---|---|---|
| 500 | `INTERNAL_ERROR` | Server failed to respond |

### Side Effects

None.

---

## POST /messages/send

Send context from one agent to another. The message is persisted and queued for pickup.

### Request

**Body** (JSON):

| Field | Type | Required | Validation | Description |
|---|---|---|---|---|
| `conversation` | string | Yes | UUID format | Conversation thread identifier |
| `sender` | string | Yes | min length 1 | Sending agent identifier |
| `recipient` | string | Yes | min length 1 | Receiving agent identifier |
| `payload` | string | Yes | min length 1 | Message content to send |
| `meta_prompt` | string | No | -- | Optional guidance for the recipient on how to process this context |

### Response (201)

```jsonc
{
  "ok": true,
  "data": {
    "id": "uuid",              // Generated message ID
    "conversation": "uuid",
    "sender": "string",
    "recipient": "string",
    "kind": "context",         // Always "context" for this endpoint
    "payload": "string",
    "meta_prompt": "string|null",
    "created_at": "ISO-8601",
    "read_at": null             // Always null on creation
  }
}
```

### Error Cases

| HTTP Status | Code | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Request body failed Zod validation (missing/invalid fields). `details` contains the Zod issue array. |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

### Side Effects

- Inserts one row into the `messages` table with `kind = 'context'`.

---

## GET /messages/conversation/:conversation

Retrieve all messages for a conversation in chronological order.

### Request

**Path Parameters:**

| Param | Type | Required | Validation | Description |
|---|---|---|---|---|
| `conversation` | string | Yes | UUID format | Conversation thread identifier |

### Response (200)

```jsonc
{
  "ok": true,
  "data": [
    {
      "id": "uuid",
      "conversation": "uuid",
      "sender": "string",
      "recipient": "string",
      "kind": "context|task|status|reply",
      "payload": "string",
      "meta_prompt": "string|null",
      "created_at": "ISO-8601",
      "read_at": "ISO-8601|null"
    }
    // ... ordered by created_at ASC
  ]
}
```

Returns an empty array if no messages exist for the conversation.

### Error Cases

| HTTP Status | Code | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Path parameter `conversation` is not a valid UUID |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

### Side Effects

None. Read-only.

---

## GET /messages/unread

Get unread messages for a specific recipient. Messages are marked as read atomically on retrieval.

### Request

**Query Parameters:**

| Param | Type | Required | Validation | Description |
|---|---|---|---|---|
| `recipient` | string | Yes | min length 1 | Agent identifier to check for unread messages |

### Response (200)

```jsonc
{
  "ok": true,
  "data": [
    {
      "id": "uuid",
      "conversation": "uuid",
      "sender": "string",
      "recipient": "string",
      "kind": "context|task|status|reply",
      "payload": "string",
      "meta_prompt": "string|null",
      "created_at": "ISO-8601",
      "read_at": null              // Always null in the returned snapshot
    }
    // ... ordered by created_at ASC
  ]
}
```

Returns an empty array if no unread messages exist.

### Error Cases

| HTTP Status | Code | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Query parameter `recipient` is missing or empty |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

### Side Effects

- **Marks all returned messages as read** by setting `read_at` to the current timestamp. This happens atomically in a SQLite transaction: the unread messages are fetched, then all messages for that recipient with `read_at IS NULL` are bulk-updated.
- Subsequent calls with the same recipient will not return previously fetched messages.

---

## POST /tasks/assign

Assign a task with domain classification and implementation details. Creates both a task record and a conversation message atomically.

### Request

**Body** (JSON):

| Field | Type | Required | Validation | Description |
|---|---|---|---|---|
| `conversation` | string | Yes | UUID format | Conversation thread this task belongs to |
| `domain` | string | Yes | min length 1 | Task domain (e.g. `"frontend"`, `"backend"`, `"security"`) |
| `summary` | string | Yes | min length 1 | Brief task summary |
| `details` | string | Yes | min length 1 | Detailed implementation instructions |
| `analysis` | string | No | -- | Analysis or research request to accompany the task |
| `assigned_to` | string | No | -- | Agent identifier to assign the task to |

### Response (201)

```jsonc
{
  "ok": true,
  "data": {
    "id": "uuid",               // Generated task ID
    "conversation": "uuid",
    "domain": "string",
    "summary": "string",
    "details": "string",
    "analysis": "string|null",
    "assigned_to": "string|null",
    "status": "pending",        // Always "pending" on creation
    "created_at": "ISO-8601",
    "updated_at": "ISO-8601"
  }
}
```

### Error Cases

| HTTP Status | Code | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Request body failed Zod validation |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

### Side Effects

- Inserts one row into the `tasks` table with `status = 'pending'`.
- Inserts one row into the `messages` table with:
  - `sender`: `"system"`
  - `recipient`: value of `assigned_to`, or `"unassigned"` if omitted
  - `kind`: `"task"`
  - `payload`: JSON string containing `{ task_id, domain, summary, details }`
  - `meta_prompt`: `null`
- Both inserts are wrapped in a single SQLite transaction.

---

## GET /tasks/:id

Get a single task by its ID.

### Request

**Path Parameters:**

| Param | Type | Required | Validation | Description |
|---|---|---|---|---|
| `id` | string | Yes | UUID format | Task identifier |

### Response (200)

```jsonc
{
  "ok": true,
  "data": {
    "id": "uuid",
    "conversation": "uuid",
    "domain": "string",
    "summary": "string",
    "details": "string",
    "analysis": "string|null",
    "assigned_to": "string|null",
    "status": "pending|in_progress|completed|failed",
    "created_at": "ISO-8601",
    "updated_at": "ISO-8601"
  }
}
```

### Error Cases

| HTTP Status | Code | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Path parameter `id` is not a valid UUID |
| 404 | `NOT_FOUND` | No task exists with the given ID. Message: `"Task <id> not found"` |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

### Side Effects

None. Read-only.

---

## GET /tasks/conversation/:conversation

Get all tasks for a conversation in chronological order.

### Request

**Path Parameters:**

| Param | Type | Required | Validation | Description |
|---|---|---|---|---|
| `conversation` | string | Yes | UUID format | Conversation thread identifier |

### Response (200)

```jsonc
{
  "ok": true,
  "data": [
    {
      "id": "uuid",
      "conversation": "uuid",
      "domain": "string",
      "summary": "string",
      "details": "string",
      "analysis": "string|null",
      "assigned_to": "string|null",
      "status": "pending|in_progress|completed|failed",
      "created_at": "ISO-8601",
      "updated_at": "ISO-8601"
    }
    // ... ordered by created_at ASC
  ]
}
```

Returns an empty array if no tasks exist for the conversation.

### Error Cases

| HTTP Status | Code | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Path parameter `conversation` is not a valid UUID |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

### Side Effects

None. Read-only.

---

## POST /tasks/report

Report status back with feedback, suggestions, or completion. Optionally updates an associated task.

### Request

**Body** (JSON):

| Field | Type | Required | Validation | Description |
|---|---|---|---|---|
| `conversation` | string | Yes | UUID format | Conversation thread identifier |
| `sender` | string | Yes | min length 1 | Reporting agent identifier |
| `recipient` | string | Yes | min length 1 | Agent to notify |
| `task_id` | string | No | UUID format | Task ID to update status on. If provided, the task must exist. |
| `status` | string | Yes | One of: `"in_progress"`, `"completed"`, `"failed"` | Current status to report |
| `payload` | string | Yes | min length 1 | Status report content -- feedback, suggestions, or completion details |

### Response (201)

```jsonc
{
  "ok": true,
  "data": {
    "message_id": "uuid",      // ID of the created status message
    "task_updated": true        // Whether a task was updated (true only if task_id was provided)
  }
}
```

### Error Cases

| HTTP Status | Code | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Request body failed Zod validation |
| 404 | `NOT_FOUND` | `task_id` was provided but no task exists with that ID. Message: `"Task <id> not found"` |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

### Side Effects

- Inserts one row into the `messages` table with:
  - `kind`: `"status"`
  - `meta_prompt`: `null`
- If `task_id` is provided and the task exists:
  - Updates the task's `status` field to the provided value
  - Updates the task's `analysis` field to the `payload` value (only if not already set, via `COALESCE(@analysis, analysis)`)
  - Updates the task's `updated_at` timestamp
- The task existence check happens before any writes. The message insert and task update are wrapped in a single SQLite transaction.

---

## GET /conversations

Get a paginated list of conversation summaries, aggregated from messages and tasks.

### Request

**Query Parameters:**

| Param | Type | Required | Validation | Description |
|---|---|---|---|---|
| `limit` | number | No | Integer, min 1, max 100, default 20 | Number of conversations to return |
| `offset` | number | No | Integer, min 0, default 0 | Number of conversations to skip |

### Response (200)

```jsonc
{
  "ok": true,
  "data": [
    {
      "conversation": "uuid",         // Conversation UUID
      "participants": ["agent-a", "agent-b"],  // Unique senders/recipients
      "message_count": 4,
      "task_count": 1,
      "last_activity": "ISO-8601"     // Most recent created_at across messages + tasks
    }
    // ... ordered by last_activity DESC
  ]
}
```

Returns an empty array if no conversations exist.

### Error Cases

| HTTP Status | Code | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Invalid query parameters |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

### Side Effects

None. Read-only.

---

## GET /events

Server-Sent Events stream. Clients receive real-time notifications when messages or tasks are created or updated.

### Request

No parameters. The client should use `EventSource` or equivalent.

### Response (200, `text/event-stream`)

The connection stays open indefinitely. Events are sent as SSE `data:` lines:

**Initial connection event:**
```
data: {"type":"connected","data":{"timestamp":"ISO-8601"}}
```

**Message created:**
```
data: {"type":"message:created","data":{...MessageRow}}
```

**Task created:**
```
data: {"type":"task:created","data":{...TaskRow}}
```

**Task updated:**
```
data: {"type":"task:updated","data":{...TaskRow}}
```

**Heartbeat (every 30 seconds):**
```
:heartbeat
```

### Error Cases

No standard error response — connection failures result in the EventSource client reconnecting automatically.

### Side Effects

None. Read-only stream.

---

## MCP Tool: send_context

Identical logic to `POST /messages/send`, exposed over MCP stdio transport.

### Parameters

| Param | Type | Required | Description |
|---|---|---|---|
| `conversation` | string (UUID) | Yes | Conversation UUID -- use `crypto.randomUUID()` to start a new one |
| `sender` | string (min 1) | Yes | Sender agent identifier (e.g. `"claude-code"`, `"codex"`) |
| `recipient` | string (min 1) | Yes | Recipient agent identifier |
| `payload` | string (min 1) | Yes | The context or message content to send |
| `meta_prompt` | string | No | Optional meta-prompt guiding how the recipient should process this |

### Response

On success, returns a JSON text block containing the full `MessageRow` object (same shape as the REST `data` field).

On error, returns an error text block: `"Error [<CODE>]: <message>"` with `isError: true`.

### Side Effects

Same as `POST /messages/send`.

---

## MCP Tool: get_messages

Identical logic to `GET /messages/conversation/:conversation`, exposed over MCP stdio transport.

### Parameters

| Param | Type | Required | Description |
|---|---|---|---|
| `conversation` | string (UUID) | Yes | Conversation UUID to retrieve messages for |

### Response

On success, returns a JSON text block containing an array of `MessageRow` objects in chronological order.

### Side Effects

None. Read-only.

---

## MCP Tool: get_unread

Identical logic to `GET /messages/unread`, exposed over MCP stdio transport.

### Parameters

| Param | Type | Required | Description |
|---|---|---|---|
| `recipient` | string (min 1) | Yes | Agent identifier to check for unread messages |

### Response

On success, returns a JSON text block containing an array of unread `MessageRow` objects. Messages are marked as read atomically on retrieval.

### Side Effects

Same as `GET /messages/unread` -- marks all returned messages as read.

---

## MCP Tool: assign_task

Identical logic to `POST /tasks/assign`, exposed over MCP stdio transport.

### Parameters

| Param | Type | Required | Description |
|---|---|---|---|
| `conversation` | string (UUID) | Yes | Conversation UUID this task belongs to |
| `domain` | string (min 1) | Yes | Task domain (e.g. `"frontend"`, `"backend"`, `"security"`) |
| `summary` | string (min 1) | Yes | Brief task summary |
| `details` | string (min 1) | Yes | Detailed implementation instructions |
| `analysis` | string | No | Analysis or research request to accompany the task |
| `assigned_to` | string | No | Agent identifier to assign the task to |

### Response

On success, returns a JSON text block containing the full `TaskRow` object.

### Side Effects

Same as `POST /tasks/assign` -- inserts one task row and one message row in a transaction.

---

## MCP Tool: report_status

Identical logic to `POST /tasks/report`, exposed over MCP stdio transport.

### Parameters

| Param | Type | Required | Description |
|---|---|---|---|
| `conversation` | string (UUID) | Yes | Conversation UUID |
| `sender` | string (min 1) | Yes | Reporting agent identifier |
| `recipient` | string (min 1) | Yes | Agent to notify |
| `task_id` | string (UUID) | No | Task ID to update status on |
| `status` | enum | Yes | One of: `"in_progress"`, `"completed"`, `"failed"` |
| `payload` | string (min 1) | Yes | Status report content -- feedback, suggestions, or completion details |

### Response

On success, returns a JSON text block containing `{ message_id, task_updated }`.

On error (task not found), returns an error text block: `"Error [NOT_FOUND]: Task <id> not found"` with `isError: true`.

### Side Effects

Same as `POST /tasks/report` -- inserts a status message and optionally updates the referenced task in a transaction.

---

## Memory Endpoints

All memory endpoints operate against a separate SQLite database (`memory.db`). They share the same `{ ok, data }` / `{ ok, error }` envelope as the bridge endpoints.

### Schema Types

**Node kinds:** `message`, `conversation`, `topic`, `decision`, `artifact`, `task`

**Edge kinds:** `contains`, `spawned`, `assigned_in`, `reply_to`, `led_to`, `discussed_in`, `decided_in`, `implemented_by`, `references`, `related_to`

**NodeResponse** (returned by all node-fetching endpoints):

```jsonc
{
  "id": "uuid",
  "repo": "string",                           // Repository slug
  "kind": "message|conversation|topic|...",
  "title": "string",
  "body": "string",
  "meta": "{}",                               // JSON string with source-specific metadata
  "source_id": "string",
  "source_type": "string",
  "sender": "string|null",                    // Originating agent identifier, if known
  "created_at": "ISO-8601",
  "updated_at": "ISO-8601"
}
```

**EdgeResponse** (returned by all edge-fetching endpoints):

```jsonc
{
  "id": "uuid",
  "repo": "string",
  "from_node": "uuid",
  "to_node": "uuid",
  "kind": "contains|related_to|...",
  "weight": 1.0,
  "meta": "{}",                               // JSON string (may include a note field)
  "auto": 0,                                  // 1 = auto-created, 0 = manual
  "created_at": "ISO-8601"
}
```

---

## GET /memory/search

Search memory nodes by query string using keyword, semantic, or hybrid mode.

### Request

**Query Parameters:**

| Param | Type | Required | Validation | Description |
|---|---|---|---|---|
| `query` | string | Yes | -- | Search query text |
| `repo` | string | Yes | -- | Repository slug to scope the search |
| `mode` | string | No | One of: `"semantic"`, `"keyword"`, `"hybrid"` (default `"hybrid"`) | Search algorithm |
| `kinds` | string | No | Comma-separated node kinds | Filter results to specific node kinds |
| `limit` | number | No | Integer, min 1, max 100, default 20 | Maximum number of results to return |
| `sender` | string | No | -- | Filter results to nodes from a specific sender |

### Response (200)

```jsonc
{
  "ok": true,
  "data": [
    {
      "node_id": "uuid",
      "kind": "message|conversation|topic|...",
      "title": "string",
      "body": "string",
      "score": 0.87,
      "match_type": "keyword|semantic|hybrid"
    }
    // ... ordered by descending score
  ]
}
```

### Error Cases

| HTTP Status | Code | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Query parameters failed Zod validation |
| 503 | `EMBEDDING_NOT_READY` | Semantic or hybrid mode requested but embedding model has not yet initialised. Retry or use `mode=keyword`. |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

### Side Effects

None. Read-only.

---

## GET /memory/node/:id

Get a single memory node by its ID.

### Request

**Path Parameters:**

| Param | Type | Required | Validation | Description |
|---|---|---|---|---|
| `id` | string | Yes | -- | Node identifier |

### Response (200)

```jsonc
{
  "ok": true,
  "data": {
    "id": "uuid",
    "repo": "string",
    "kind": "message|conversation|topic|decision|artifact|task",
    "title": "string",
    "body": "string",
    "meta": "{}",
    "source_id": "string",
    "source_type": "string",
    "sender": "string|null",
    "created_at": "ISO-8601",
    "updated_at": "ISO-8601"
  }
}
```

### Error Cases

| HTTP Status | Code | Meaning |
|---|---|---|
| 404 | `NOT_FOUND` | No node exists with the given ID. Message: `"Node <id> not found"` |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

### Side Effects

None. Read-only.

---

## GET /memory/node/:id/edges

Get all edges connected to a memory node (both outgoing and incoming), deduplicated by edge ID.

### Request

**Path Parameters:**

| Param | Type | Required | Validation | Description |
|---|---|---|---|---|
| `id` | string | Yes | -- | Node identifier |

### Response (200)

```jsonc
{
  "ok": true,
  "data": [
    {
      "id": "uuid",
      "repo": "string",
      "from_node": "uuid",
      "to_node": "uuid",
      "kind": "contains|related_to|...",
      "weight": 1.0,
      "meta": "{}",
      "auto": 1,
      "created_at": "ISO-8601"
    }
    // ... includes both edges where this node is source and edges where it is target
  ]
}
```

Returns an empty array if no edges exist for the node.

### Error Cases

| HTTP Status | Code | Meaning |
|---|---|---|
| 500 | `INTERNAL_ERROR` | Unexpected server error |

### Side Effects

None. Read-only.

---

## GET /memory/traverse/:id

BFS-traverse the memory graph starting from a given node, returning all reachable nodes and edges within depth and size limits. Also records a traversal log entry.

### Request

**Path Parameters:**

| Param | Type | Required | Validation | Description |
|---|---|---|---|---|
| `id` | string | Yes | -- | Starting node identifier |

**Query Parameters:**

| Param | Type | Required | Validation | Description |
|---|---|---|---|---|
| `direction` | string | No | One of: `"outgoing"`, `"incoming"`, `"both"` (default `"both"`) | Edge traversal direction |
| `edge_kinds` | string | No | Comma-separated edge kinds | Restrict traversal to specific edge kinds |
| `max_depth` | number | No | Integer, min 1, max 10, default 3 | Maximum BFS depth |
| `max_nodes` | number | No | Integer, min 1, max 200, default 50 | Maximum nodes to return |
| `agent` | string | No | Max 64 chars, alphanumeric + `_-`, default `"anonymous"` | Agent identifier for traversal log |
| `sender` | string | No | -- | Filter traversed nodes to a specific sender |

### Response (200)

```jsonc
{
  "ok": true,
  "data": {
    "root": "uuid",                // Starting node ID
    "nodes": [ /* NodeResponse[] */ ],
    "edges": [ /* EdgeResponse[] */ ]
  }
}
```

### Error Cases

| HTTP Status | Code | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Query parameters failed Zod validation |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

### Side Effects

- Inserts one row into the `traversal_logs` table recording the operation, agent, start node, parameters, and the ordered list of steps visited. Log failure is non-fatal and does not affect the response.

---

## GET /memory/context

Assemble token-budgeted context from memory for a query or starting node. Sections are ordered by relevance and capped to the specified token budget. Also records a context traversal log entry.

### Request

**Query Parameters:**

| Param | Type | Required | Validation | Description |
|---|---|---|---|---|
| `query` | string | No | -- | Search query to find relevant context |
| `node_id` | string | No | -- | Specific node to anchor context assembly |
| `repo` | string | Yes | -- | Repository slug |
| `max_tokens` | number | No | Integer, min 1, max 32000, default 8000 | Token budget for the assembled context |
| `agent` | string | No | Max 64 chars, alphanumeric + `_-`, default `"anonymous"` | Agent identifier for traversal log |

At least one of `query` or `node_id` should be provided for meaningful results.

### Response (200)

```jsonc
{
  "ok": true,
  "data": {
    "summary": "string",           // Brief summary of the assembled context
    "token_estimate": 1234,        // Total estimated token count across all sections
    "sections": [
      {
        "heading": "string",
        "content": "string",
        "token_estimate": 256,     // Estimated tokens for this section
        "relevance": 0.91,         // Relevance score (higher is more relevant)
        "node_ids": ["uuid", ...]  // IDs of the nodes contributing to this section
      }
      // ... ordered by relevance DESC, capped by max_tokens
    ]
  }
}
```

### Error Cases

| HTTP Status | Code | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Query parameters failed Zod validation |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

### Side Effects

- Inserts one row into the `traversal_logs` table recording the operation, agent, parameters, and each node included in the assembled context. Log failure is non-fatal and does not affect the response.

---

## GET /memory/topics

Get all topic nodes for a repository.

### Request

**Query Parameters:**

| Param | Type | Required | Validation | Description |
|---|---|---|---|---|
| `repo` | string | Yes | -- | Repository slug |

### Response (200)

```jsonc
{
  "ok": true,
  "data": [
    /* NodeResponse[] — all nodes with kind = "topic" for the given repo */
  ]
}
```

Returns an empty array if no topic nodes exist for the repo.

### Error Cases

| HTTP Status | Code | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Query parameter `repo` is missing |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

### Side Effects

None. Read-only.

---

## GET /memory/stats

Get node and edge counts for a repository.

### Request

**Query Parameters:**

| Param | Type | Required | Validation | Description |
|---|---|---|---|---|
| `repo` | string | Yes | -- | Repository slug |

### Response (200)

```jsonc
{
  "ok": true,
  "data": {
    "node_count": 142,
    "edge_count": 317
  }
}
```

### Error Cases

| HTTP Status | Code | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Query parameter `repo` is missing |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

### Side Effects

None. Read-only.

---

## POST /memory/ingest

Ingest a conversation or document into the memory graph. Supports three source formats: `generic` (inline JSON), `transcript` (JSONL file), and `claude-code` (Claude Code JSONL summary file). The `bridge` and `git` sources are not supported via REST.

### Request

**Body** (JSON):

| Field | Type | Required | Validation | Description |
|---|---|---|---|---|
| `repo` | string | Yes | -- | Repository slug |
| `source` | string | Yes | One of: `"generic"`, `"transcript"`, `"claude-code"` | Ingestion source format (`bridge` and `git` are rejected) |
| `session_id` | string | No | -- | Session identifier for idempotency. Required for all supported sources. |
| `title` | string | No | -- | Human-readable session title (falls back to `session_id`) |
| `path` | string | No | -- | Absolute file path. Required for `transcript` and `claude-code` sources. |
| `content` | string | No | -- | Inline JSON array of messages. Required for `generic` source. |
| `agent` | string | No | Max 64 chars, alphanumeric + `_-`, default `"anonymous"` | Agent identifier |

**Source-specific requirements:**

- `generic`: `session_id` and `content` are required. `content` must be a valid JSON array of `{ role, content, timestamp? }` objects.
- `transcript`: `session_id` and `path` are required. File must be a JSONL Claude transcript.
- `claude-code`: `session_id` and `path` are required. File must be a JSONL Claude Code summary file.

### Response (201)

```jsonc
{
  "ok": true,
  "data": {
    "conversation_id": "string",   // Session ID echoed back
    "messages_ingested": 48,
    "edges_created": 51,
    "skipped": 2                   // Messages skipped (e.g. duplicates or filtered)
  }
}
```

### Error Cases

| HTTP Status | Code | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Request body failed Zod validation, or required source-specific fields are missing |
| 400 | `VALIDATION` | `content` is not a valid JSON array (generic source) |
| 400 | `UNSUPPORTED_SOURCE` | `source` is `"bridge"` or `"git"`, which are not supported via REST |
| 400 | `IO_ERROR` | File at `path` could not be read |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

### Side Effects

- Inserts node rows (conversation, message, and optionally topic/decision nodes) into `memory.db`.
- Inserts edge rows linking nodes together.
- Updates `ingestion_cursors` rows to track progress for idempotency on re-runs.
- Secret filter is applied to all content before storage.

---

## POST /memory/node/:id/expand

Expand a summary-only Claude Code turn node into full detail nodes by re-reading its source file. The turn node's metadata must contain a `file_path`, or the file path must be discoverable via a `contains` edge to a parent conversation node.

### Request

**Path Parameters:**

| Param | Type | Required | Validation | Description |
|---|---|---|---|---|
| `id` | string | Yes | -- | Turn node identifier to expand |

No request body.

### Response (201)

```jsonc
{
  "ok": true,
  "data": {
    "nodes_created": 5,
    "edges_created": 5,
    "nodes": [ /* NodeResponse[] — the newly created child nodes */ ],
    "edges": [ /* EdgeResponse[] — edges from this turn node to the child nodes */ ]
  }
}
```

### Error Cases

| HTTP Status | Code | Meaning |
|---|---|---|
| 404 | `NOT_FOUND` | No node exists with the given ID. Message: `"Node <id> not found"` |
| 400 | `VALIDATION` | Node metadata does not contain a resolvable `file_path` |
| 400 | `IO_ERROR` | File at the resolved path could not be read |
| 500 | `INTERNAL_ERROR` | Node metadata JSON could not be parsed |

### Side Effects

- Inserts new child node rows into `memory.db`.
- Inserts `contains` edge rows from the turn node to each new child node.
- Secret filter is applied to all content before storage.

---

## POST /memory/link

Create a manual edge between two existing memory nodes. Both nodes must exist and belong to the same repo (the repo is derived from the source node).

### Request

**Body** (JSON):

| Field | Type | Required | Validation | Description |
|---|---|---|---|---|
| `from_node` | string | Yes | -- | Source node ID |
| `to_node` | string | Yes | -- | Target node ID |
| `kind` | string | Yes | One of the edge kinds: `contains`, `spawned`, `assigned_in`, `reply_to`, `led_to`, `discussed_in`, `decided_in`, `implemented_by`, `references`, `related_to` | Edge kind |
| `note` | string | No | -- | Optional human-readable note stored in edge metadata |

### Response (201)

```jsonc
{
  "ok": true,
  "data": {
    "id": "uuid",
    "repo": "string",
    "from_node": "uuid",
    "to_node": "uuid",
    "kind": "related_to",
    "weight": 1.0,
    "meta": "{}",                  // Contains { "note": "..." } if note was provided
    "auto": 0,                     // Always 0 (manual edge)
    "created_at": "ISO-8601"
  }
}
```

### Error Cases

| HTTP Status | Code | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Request body failed Zod validation |
| 404 | `NOT_FOUND` | Source or target node does not exist. Message: `"Node <id> not found"` |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

### Side Effects

- Inserts one row into the `edges` table with `auto = 0`.
- The insert is wrapped in a SQLite transaction.
- Secret filter is applied to the `note` field before storage.

---

## POST /memory/node

Create a new `topic` or `decision` node and optionally link it to an existing node.

### Request

**Body** (JSON):

| Field | Type | Required | Validation | Description |
|---|---|---|---|---|
| `repo` | string | Yes | -- | Repository slug |
| `kind` | string | Yes | One of: `"topic"`, `"decision"` | Node kind |
| `title` | string | Yes | -- | Node title |
| `body` | string | No | -- | Node body content |
| `related_to` | string | No | -- | UUID of an existing node to link via a `related_to` edge |

### Response (201)

```jsonc
{
  "ok": true,
  "data": {
    "id": "uuid",
    "repo": "string",
    "kind": "topic|decision",
    "title": "string",
    "body": "string",
    "meta": "{}",
    "source_id": "uuid",           // Auto-generated UUID
    "source_type": "manual",
    "sender": null,
    "created_at": "ISO-8601",
    "updated_at": "ISO-8601"
  }
}
```

### Error Cases

| HTTP Status | Code | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Request body failed Zod validation |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

### Side Effects

- Inserts one row into the `nodes` table with `source_type = "manual"`.
- If `related_to` is provided and the referenced node exists, also inserts one `related_to` edge row.
- Both inserts are wrapped in a single SQLite transaction.
- Secret filter is applied to `title` and `body` before storage.

---

## GET /memory/traversals

List recent traversal logs for a repository, ordered by creation time descending.

### Request

**Query Parameters:**

| Param | Type | Required | Validation | Description |
|---|---|---|---|---|
| `repo` | string | Yes | -- | Repository slug |
| `limit` | number | No | Integer, min 1, max 100, default 20 | Number of logs to return |

### Response (200)

```jsonc
{
  "ok": true,
  "data": [
    {
      "id": "uuid",
      "repo": "string",
      "agent": "string",
      "operation": "traverse|context",
      "start_node": "uuid|null",
      "params": { /* arbitrary key-value pairs recorded at traversal time */ },
      "steps": [
        {
          "node_id": "uuid",
          "parent_id": "uuid|null",
          "edge_id": "uuid|null",
          "edge_kind": "string|null"
        }
        // ... one entry per node visited in BFS order
      ],
      "scores": { /* node_id → score, present on context operations */ },
      "token_allocation": { /* section heading → tokens, present on context operations */ },
      "created_at": "ISO-8601"
    }
    // ... ordered by created_at DESC
  ]
}
```

Returns an empty array if no logs exist.

### Error Cases

| HTTP Status | Code | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Query parameters failed Zod validation |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

### Side Effects

None. Read-only.

---

## GET /memory/traversals/:id

Get a single traversal log by its ID.

### Request

**Path Parameters:**

| Param | Type | Required | Validation | Description |
|---|---|---|---|---|
| `id` | string | Yes | -- | Traversal log identifier |

### Response (200)

```jsonc
{
  "ok": true,
  "data": {
    "id": "uuid",
    "repo": "string",
    "agent": "string",
    "operation": "traverse|context",
    "start_node": "uuid|null",
    "params": { /* ... */ },
    "steps": [ /* TraversalLogStep[] */ ],
    "scores": { /* optional */ },
    "token_allocation": { /* optional */ },
    "created_at": "ISO-8601"
  }
}
```

### Error Cases

| HTTP Status | Code | Meaning |
|---|---|---|
| 404 | `NOT_FOUND` | No traversal log exists with the given ID. Message: `"Traversal log <id> not found"` |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

### Side Effects

None. Read-only.

---

## GET /memory/senders

List all distinct sender values present on nodes for a repository.

### Request

**Query Parameters:**

| Param | Type | Required | Validation | Description |
|---|---|---|---|---|
| `repo` | string | Yes | -- | Repository slug |

### Response (200)

```jsonc
{
  "ok": true,
  "data": ["claude-code", "user", "assistant"]   // Sorted array of distinct sender strings
}
```

Returns an empty array if no nodes have a sender value for the repo.

### Error Cases

| HTTP Status | Code | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Query parameter `repo` is missing |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

### Side Effects

None. Read-only.

---

## MCP Tool: search_memory

Search conversation memory using hybrid FTS5 + vector search. Exposed over MCP stdio transport.

### Parameters

| Param | Type | Required | Description |
|---|---|---|---|
| `query` | string | Yes | Search query text |
| `repo` | string | Yes | Repository slug filter |
| `mode` | enum | No | One of: `"semantic"`, `"keyword"`, `"hybrid"` (default `"hybrid"`) |
| `kinds` | string[] | No | Array of node kinds to include |
| `limit` | number | No | Max results (default 20) |

### Response

On success, returns a JSON text block containing an array of `SearchResult` objects (`node_id`, `kind`, `title`, `body`, `score`, `match_type`).

On error, returns an error text block: `"Error [<CODE>]: <message>"` with `isError: true`.

### Side Effects

None. Read-only.

---

## MCP Tool: traverse_memory

BFS-traverse the memory graph from a starting node. Exposed over MCP stdio transport.

### Parameters

| Param | Type | Required | Description |
|---|---|---|---|
| `node_id` | string | Yes | Starting node UUID |
| `direction` | enum | No | One of: `"outgoing"`, `"incoming"`, `"both"` |
| `edge_kinds` | string[] | No | Edge kinds to follow |
| `max_depth` | number | No | Maximum traversal depth |
| `max_nodes` | number | No | Maximum nodes to return |

### Response

On success, returns a JSON text block containing `{ root, nodes, edges }`. Does not record a traversal log (unlike the REST endpoint).

### Side Effects

None. Read-only.

---

## MCP Tool: get_context

Assemble token-budgeted context from memory for an agent query. Exposed over MCP stdio transport.

### Parameters

| Param | Type | Required | Description |
|---|---|---|---|
| `query` | string | No | Search query to find relevant context |
| `node_id` | string | No | Specific node to start from |
| `repo` | string | Yes | Repository slug |
| `max_tokens` | number | No | Token budget for assembled context (default 8000) |

### Response

On success, returns a JSON text block containing `{ summary, sections, token_estimate }`. Does not record a traversal log (unlike the REST endpoint).

### Side Effects

None. Read-only.

---

## MCP Tool: create_memory_link

Create an edge between two memory nodes. Exposed over MCP stdio transport.

### Parameters

| Param | Type | Required | Description |
|---|---|---|---|
| `from_node` | string | Yes | Source node UUID |
| `to_node` | string | Yes | Target node UUID |
| `kind` | enum | Yes | Edge kind (e.g. `related_to`, `references`, `led_to`) |
| `note` | string | No | Optional note stored in edge meta |

### Response

On success, returns a JSON text block containing the full `EdgeResponse` object.

On error, returns an error text block: `"Error [NOT_FOUND]: Node <id> not found"` with `isError: true`.

### Side Effects

- Inserts one edge row into `memory.db` with `auto = 0`.
- Secret filter is applied to the `note` field before storage.

---

## MCP Tool: create_memory_node

Create a topic or decision node in memory. Exposed over MCP stdio transport.

### Parameters

| Param | Type | Required | Description |
|---|---|---|---|
| `repo` | string | Yes | Repository slug |
| `kind` | enum | Yes | One of: `"topic"`, `"decision"` |
| `title` | string | Yes | Node title |
| `body` | string | No | Node body content |
| `related_to` | string | No | UUID of an existing node to link with a `related_to` edge |

### Response

On success, returns a JSON text block containing the full `NodeResponse` object.

### Side Effects

- Inserts one node row into `memory.db` with `source_type = "manual"`.
- If `related_to` is provided and the node exists, also inserts one `related_to` edge row.
- Secret filter is applied to `title` and `body` before storage.

---

## MCP Tool: ingest_conversation

Ingest a conversation into the memory graph for long-term preservation. Exposed over MCP stdio transport. Supports the same source formats as `POST /memory/ingest` except `bridge` and `git`.

### Parameters

| Param | Type | Required | Description |
|---|---|---|---|
| `repo` | string | Yes | Repository slug |
| `source` | enum | Yes | One of: `"claude-code"`, `"transcript"`, `"generic"` |
| `session_id` | string | Yes | Unique session ID for idempotency |
| `title` | string | No | Conversation title (falls back to `session_id`) |
| `content` | string | No | Inline JSON array of messages. Required for `generic` source. |
| `path` | string | No | Absolute file path. Required for `transcript` and `claude-code` sources. |
| `agent` | string | No | Agent identifier |

### Response

On success, returns a JSON text block containing `{ conversation_id, messages_ingested, edges_created, skipped }`.

On error, returns an error text block: `"Error [<CODE>]: <message>"` with `isError: true`. Error codes match those of `POST /memory/ingest`.

### Side Effects

Same as `POST /memory/ingest` — inserts nodes and edges into `memory.db`, updates ingestion cursors, applies secret filtering.

---

## Schema Changes

The following fields were added to existing response shapes as part of the memory system introduction.

### `sender` on NodeResponse

All `NodeResponse` objects now include a `sender` field (type: `string | null`). This carries the originating agent identifier when a node was created from a bridge message ingestion. It is `null` for nodes created via other ingestion paths or manually.

### `node_ids` on ContextSection

Each `ContextSection` returned by `GET /memory/context` now includes a `node_ids` field (type: `string[]`). This array lists the IDs of the memory nodes that contributed content to that section, enabling callers to trace context back to its source nodes.

### `steps` on TraversalLogResponse

`TraversalLogResponse` (returned by `GET /memory/traversals` and `GET /memory/traversals/:id`) includes a `steps` field (type: `TraversalLogStep[]`). Each step records one node visited during a traverse or context operation:

```jsonc
{
  "node_id": "uuid",
  "parent_id": "uuid|null",   // Node from which this node was reached
  "edge_id": "uuid|null",     // Edge traversed to reach this node
  "edge_kind": "string|null"  // Kind of the traversed edge
}
```

### `agent` parameter on traverse and context endpoints

`GET /memory/traverse/:id` and `GET /memory/context` both accept an `agent` query parameter (max 64 chars, alphanumeric + `_-`, default `"anonymous"`). This value is recorded in the `traversal_logs` table to identify which agent performed the operation. It has no effect on the returned data.
