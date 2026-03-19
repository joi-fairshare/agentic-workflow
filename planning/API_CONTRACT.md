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
