import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

// ── Row types ──────────────────────────────────────────────

export interface MessageRow {
  id: string;
  conversation: string;
  sender: string;
  recipient: string;
  kind: "context" | "task" | "status" | "reply";
  payload: string;
  meta_prompt: string | null;
  created_at: string;
  read_at: string | null;
}

export interface TaskRow {
  id: string;
  conversation: string;
  domain: string;
  summary: string;
  details: string;
  analysis: string | null;
  assigned_to: string | null;
  status: "pending" | "in_progress" | "completed" | "failed";
  created_at: string;
  updated_at: string;
}

// ── Database client ────────────────────────────────────────

export interface ConversationSummary {
  conversation: string;
  message_count: number;
  task_count: number;
  last_activity: string;
}

export interface DbClient {
  insertMessage(msg: Omit<MessageRow, "id" | "created_at" | "read_at">): MessageRow;
  getMessage(id: string): MessageRow | undefined;
  getMessagesByConversation(conversation: string): MessageRow[];
  getUnreadMessages(recipient: string): MessageRow[];
  markRead(id: string): void;
  markAllRead(recipient: string): void;
  insertTask(task: Omit<TaskRow, "id" | "created_at" | "updated_at" | "status">): TaskRow;
  getTask(id: string): TaskRow | undefined;
  getTasksByConversation(conversation: string): TaskRow[];
  updateTaskStatus(id: string, status: TaskRow["status"], analysis?: string): void;
  transaction<T>(fn: () => T): T;
  getConversations(limit: number, offset: number): ConversationSummary[];
  getConversationCount(): number;
}

export function createDbClient(db: Database.Database): DbClient {
  // Prepare statements once
  const stmts = {
    insertMessage: db.prepare(`
      INSERT INTO messages (id, conversation, sender, recipient, kind, payload, meta_prompt)
      VALUES (@id, @conversation, @sender, @recipient, @kind, @payload, @meta_prompt)
    `),

    getMessage: db.prepare(`
      SELECT * FROM messages WHERE id = @id
    `),

    getByConversation: db.prepare(`
      SELECT * FROM messages WHERE conversation = @conversation ORDER BY created_at ASC
    `),

    getUnread: db.prepare(`
      SELECT * FROM messages WHERE recipient = @recipient AND read_at IS NULL ORDER BY created_at ASC
    `),

    markRead: db.prepare(`
      UPDATE messages SET read_at = @read_at WHERE id = @id
    `),

    insertTask: db.prepare(`
      INSERT INTO tasks (id, conversation, domain, summary, details, analysis, assigned_to)
      VALUES (@id, @conversation, @domain, @summary, @details, @analysis, @assigned_to)
    `),

    getTask: db.prepare(`
      SELECT * FROM tasks WHERE id = @id
    `),

    getTasksByConversation: db.prepare(`
      SELECT * FROM tasks WHERE conversation = @conversation ORDER BY created_at ASC
    `),

    updateTaskStatus: db.prepare(`
      UPDATE tasks SET status = @status, analysis = COALESCE(@analysis, analysis), updated_at = @updated_at
      WHERE id = @id
    `),

    getConversations: db.prepare(`
      SELECT
        conversation,
        SUM(msg_count) as message_count,
        SUM(task_count) as task_count,
        MAX(last_activity) as last_activity
      FROM (
        SELECT conversation, COUNT(*) as msg_count, 0 as task_count, MAX(created_at) as last_activity
        FROM messages GROUP BY conversation
        UNION ALL
        SELECT conversation, 0 as msg_count, COUNT(*) as task_count, MAX(updated_at) as last_activity
        FROM tasks GROUP BY conversation
      ) combined
      GROUP BY conversation
      ORDER BY last_activity DESC
      LIMIT @limit OFFSET @offset
    `),

    getConversationCount: db.prepare(`
      SELECT COUNT(*) as total FROM (
        SELECT conversation FROM messages
        UNION
        SELECT conversation FROM tasks
      )
    `),
  };

  return {
    insertMessage(msg) {
      const row: MessageRow = {
        ...msg,
        id: randomUUID(),
        created_at: new Date().toISOString(),
        read_at: null,
      };
      stmts.insertMessage.run(row);
      return row;
    },

    getMessage(id) {
      return stmts.getMessage.get({ id }) as MessageRow | undefined;
    },

    getMessagesByConversation(conversation) {
      return stmts.getByConversation.all({ conversation }) as MessageRow[];
    },

    getUnreadMessages(recipient) {
      return stmts.getUnread.all({ recipient }) as MessageRow[];
    },

    markRead(id) {
      stmts.markRead.run({ id, read_at: new Date().toISOString() });
    },

    markAllRead(recipient) {
      db.prepare(`UPDATE messages SET read_at = @read_at WHERE recipient = @recipient AND read_at IS NULL`)
        .run({ recipient, read_at: new Date().toISOString() });
    },

    insertTask(task) {
      const row: TaskRow = {
        ...task,
        id: randomUUID(),
        status: "pending",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      stmts.insertTask.run(row);
      return row;
    },

    getTask(id) {
      return stmts.getTask.get({ id }) as TaskRow | undefined;
    },

    getTasksByConversation(conversation) {
      return stmts.getTasksByConversation.all({ conversation }) as TaskRow[];
    },

    updateTaskStatus(id, status, analysis) {
      stmts.updateTaskStatus.run({
        id,
        status,
        analysis: analysis ?? null,
        updated_at: new Date().toISOString(),
      });
    },

    transaction<T>(fn: () => T): T {
      return db.transaction(fn)();
    },

    getConversations(limit, offset) {
      return stmts.getConversations.all({ limit, offset }) as ConversationSummary[];
    },

    getConversationCount() {
      const row = stmts.getConversationCount.get() as { total: number };
      return row.total;
    },
  };
}
